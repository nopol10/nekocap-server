import { Inject, Injectable } from "@nestjs/common";
import {
  CAPTIONER_COLLECTION,
  CAPTIONER_PRIVATE_COLLECTION,
  CAPTIONS_COLLECTION,
  ERROR_MESSAGES,
  ROLES,
} from "../constants";
import { CaptionsService } from "../captions/captions.service";
import type {
  CaptionDoc,
  CaptionerDoc,
  CaptionerPrivateDoc,
} from "../parse-compat/documents";
import { ParseConfigService } from "../parse-compat/parse-config.service";
import { ParseDbService } from "../parse-compat/parse-db.service";
import { RolesService } from "../parse-compat/roles.service";
import type {
  CaptionListFields,
  GetOwnProfileTagsResponse,
  PrivateCaptionerDataResponse,
  PublicProfileResponse,
  ServerResponse,
  UpdateCaptionerProfileRequest,
} from "../shared/api-types";
import { withoutGroupTag } from "../shared/caption-tags";
import type { RequestContext } from "../shared/request-context";
import { escapeRegexInString } from "../shared/utils";
import { UsersService } from "../users/users.service";

const MAX_NAME_TAG = 9999;
const NAME_TAG_ATTEMPTS = 3;
const PROFILE_CAPTIONS_LIMIT = 50;

@Injectable()
export class CaptionersService {
  constructor(
    @Inject(ParseDbService) private readonly db: ParseDbService,
    @Inject(ParseConfigService) private readonly config: ParseConfigService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(CaptionsService) private readonly captions: CaptionsService,
  ) {}

  private captioners() {
    return this.db.collection<CaptionerDoc>(CAPTIONER_COLLECTION);
  }

  private async checkLoggedIn(
    ctx: RequestContext,
    checkMaintenance = true,
  ): Promise<ServerResponse | null> {
    if (!ctx.user) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (checkMaintenance && (await this.config.isInMaintenanceMode())) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    return null;
  }

  //#region Profiles

  /**
   * All data needed for the frontend dashboard after a user logs in
   */
  async loadPrivateCaptionerData(
    { withCaptions = true }: { withCaptions?: boolean },
    ctx: RequestContext,
  ): Promise<PrivateCaptionerDataResponse> {
    if (!ctx.user) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    const userId = ctx.user.id;
    const { result: captions } = withCaptions
      ? await this.captions.getCaptionerCaptions({
          captionerId: userId,
          limit: PROFILE_CAPTIONS_LIMIT,
          offset: 0,
          userId,
          tags: [],
        })
      : { result: [] as CaptionListFields[] };
    const [captioner, privateProfile] = await Promise.all([
      this.users.getUserProfile(userId),
      this.users.getUserPrivateProfile(userId),
    ]);
    return { status: "success", captions, captioner, privateProfile };
  }

  /**
   * The public profile of a captioner
   */
  async loadProfile(
    {
      profileId,
      withCaptions = true,
    }: { profileId: string; withCaptions?: boolean },
    ctx: RequestContext,
  ): Promise<PublicProfileResponse> {
    profileId = String(profileId ?? "");
    const { result: captions } = withCaptions
      ? await this.captions.getCaptionerCaptions({
          captionerId: profileId,
          limit: PROFILE_CAPTIONS_LIMIT,
          offset: 0,
          userId: ctx.user?.id,
          tags: [],
        })
      : { result: [] as CaptionListFields[] };
    const captioner = await this.users.getUserProfile(profileId);
    if (!captioner) {
      return { status: "error" };
    }
    return { status: "success", captions, captioner };
  }

  async updateCaptionerProfile(
    params: UpdateCaptionerProfileRequest,
    ctx: RequestContext,
  ): Promise<PrivateCaptionerDataResponse> {
    const error = await this.checkLoggedIn(ctx);
    if (error || !ctx.user) {
      return error as ServerResponse;
    }
    const { userId: targetUserId } = params;
    // Parse validated these types against its schema, check them here instead
    const name = String(params.name ?? "");
    const donationLink = String(params.donationLink ?? "");
    const profileMessage = String(params.profileMessage ?? "");
    const languageCodes = Array.isArray(params.languageCodes)
      ? params.languageCodes.map(String)
      : [];
    const userId = ctx.user.id;
    const isAdmin = await this.roles.hasAdminRole(userId);
    if (targetUserId !== undefined && typeof targetUserId !== "string") {
      return { status: "error", error: "Not authorized!" };
    }
    if (!isAdmin && targetUserId && targetUserId !== userId) {
      // Only an admin can change someone else's profile
      return { status: "error", error: "Not authorized!" };
    }
    const userIdToUpdate = targetUserId || userId;
    const captioner = await this.captioners().findOne({
      userId: userIdToUpdate,
    });
    if (!captioner) {
      return { status: "error", error: "Captioner not found" };
    }
    const updates: Partial<CaptionerDoc> = {
      donationLink,
      profileMessage,
      languages: languageCodes,
    };
    const originalName = captioner.name || "";
    // A name can only be set if there wasn't one in the first place. The name
    // tag makes the name + tag combination unique.
    if (name !== originalName && !originalName) {
      let nameIsValid = false;
      for (let attempt = 0; attempt < NAME_TAG_ATTEMPTS; attempt++) {
        const randomTag = Math.floor(Math.random() * (MAX_NAME_TAG + 1));
        const usersWithSameName = await this.captioners().countDocuments({
          name,
          nameTag: randomTag,
          userId: { $ne: userIdToUpdate },
        });
        if (usersWithSameName <= 0) {
          updates.name = name;
          updates.nameTag = randomTag;
          nameIsValid = true;
          break;
        }
      }
      if (!nameIsValid) {
        return { status: "error", error: "Too many users with the same name!" };
      }
    }
    await this.db.updateById<CaptionerDoc>(
      CAPTIONER_COLLECTION,
      captioner._id,
      { $set: updates },
    );

    const privateData = await this.db
      .collection<CaptionerPrivateDoc>(CAPTIONER_PRIVATE_COLLECTION)
      .findOne({ captionerId: userIdToUpdate });
    if (!privateData) {
      return { status: "error", error: "Could not query profile data" };
    }
    const [captionerProfile, privateProfile] = await Promise.all([
      this.users.getUserProfile(userIdToUpdate),
      this.users.getUserPrivateProfile(userIdToUpdate),
    ]);
    return {
      status: "success",
      captions: [],
      captioner: captionerProfile,
      privateProfile,
    };
  }

  //#endregion

  //#region Admin actions

  private async toggleCaptionerFlag(
    targetUserId: string,
    flag: "verified" | "banned",
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    const error = await this.checkLoggedIn(ctx);
    if (error || !ctx.user) {
      return error as ServerResponse;
    }
    if (!(await this.roles.hasAdminRole(ctx.user.id))) {
      return { status: "error", error: "Not authorized!" };
    }
    const captioner = targetUserId
      ? await this.captioners().findOne({ userId: String(targetUserId) })
      : null;
    if (!captioner) {
      return { status: "error", error: "Target user not found!" };
    }
    await this.db.updateById<CaptionerDoc>(
      CAPTIONER_COLLECTION,
      captioner._id,
      { $set: { [flag]: !captioner[flag] } },
    );
    return { status: "success" };
  }

  async verifyCaptioner(
    targetUserId: string,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    return this.toggleCaptionerFlag(targetUserId, "verified", ctx);
  }

  async banCaptioner(
    targetUserId: string,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    return this.toggleCaptionerFlag(targetUserId, "banned", ctx);
  }

  /**
   * Toggles the target user's membership of a role
   */
  private async toggleRole(
    targetUserId: string,
    roleName: typeof ROLES.reviewer | typeof ROLES.reviewerManager,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    const error = await this.checkLoggedIn(ctx);
    if (error || !ctx.user) {
      return error as ServerResponse;
    }
    const requesterId = ctx.user.id;
    const isAdmin = await this.roles.hasAdminRole(requesterId);
    // Reviewer managers can manage reviewers, only admins can manage
    // reviewer managers
    const isAllowed =
      isAdmin ||
      (roleName === ROLES.reviewer &&
        (await this.roles.hasReviewerManagerRole(requesterId)));
    if (!isAllowed) {
      return { status: "error", error: "Not authorized!" };
    }
    const role = await this.roles.findRole(roleName);
    if (!role) {
      return {
        status: "error",
        error:
          roleName === ROLES.reviewer
            ? "Reviewer role not found!"
            : "Reviewer Manager role not found!",
      };
    }
    const user = targetUserId
      ? await this.users.findUser(String(targetUserId))
      : null;
    if (!user) {
      return { status: "error", error: "Target user not found!" };
    }
    const hasRole =
      roleName === ROLES.reviewer
        ? await this.roles.hasReviewerRole(user._id)
        : await this.roles.hasReviewerManagerRole(user._id);
    if (hasRole) {
      await this.roles.removeUser(role, user._id);
    } else {
      await this.roles.addUser(role, user._id);
    }
    return { status: "success" };
  }

  async assignReviewerRole(
    targetUserId: string,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    return this.toggleRole(targetUserId, ROLES.reviewer, ctx);
  }

  async assignReviewerManagerRole(
    targetUserId: string,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    return this.toggleRole(targetUserId, ROLES.reviewerManager, ctx);
  }

  //#endregion

  //#region Profile tags

  async getOwnProfileTags(
    ctx: RequestContext,
  ): Promise<GetOwnProfileTagsResponse> {
    const error = await this.checkLoggedIn(ctx, false);
    if (error || !ctx.user) {
      return error as ServerResponse;
    }
    const creatorId = ctx.user.id;
    const captioner = await this.captioners().findOne({ userId: creatorId });
    if (!captioner) {
      return { status: "error", error: "Captioner not found" };
    }
    const tags: { tag: string; count: number }[] = [];
    for (const tag of captioner.captionTags || []) {
      const count = await this.captions.countCaptions({
        limit: -1,
        offset: 0,
        tags: [tag],
        getRejected: true,
        userId: creatorId,
        captionerId: creatorId,
      });
      tags.push({ tag, count });
    }
    return { status: "success", tags };
  }

  /**
   * Deletes a tag from the captioner's profile and all of their captions.
   * The tag name must be just the name portion of the tag, without the color
   */
  async deleteProfileTag(
    tagName: string,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    const error = await this.checkLoggedIn(ctx, false);
    if (error || !ctx.user) {
      return error as ServerResponse;
    }
    const creatorId = ctx.user.id;
    const captioner = await this.captioners().findOne({ userId: creatorId });
    if (!captioner) {
      return { status: "error", error: "Captioner not found" };
    }
    await this.db.updateById<CaptionerDoc>(
      CAPTIONER_COLLECTION,
      captioner._id,
      {
        $set: {
          captionTags: withoutGroupTag(captioner.captionTags || [], tagName),
        },
      },
    );
    const tagRegex = new RegExp(escapeRegexInString(`g:${tagName}:`));
    await this.db.collection<CaptionDoc>(CAPTIONS_COLLECTION).updateMany(
      { creatorId, tags: tagRegex },
      this.db.withUpdatedAt<CaptionDoc>({
        $pull: { tags: tagRegex },
      } as never),
    );
    return { status: "success" };
  }

  //#endregion
}
