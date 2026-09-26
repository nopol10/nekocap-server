import { Inject, Injectable } from "@nestjs/common";
import {
  CAPTION_LIKES_COLLECTION,
  CAPTIONS_COLLECTION,
  ERROR_MESSAGES,
} from "../constants";
import { getAdminACL } from "../parse-compat/acl";
import type {
  CaptionDoc,
  CaptionLikesDoc,
  ReviewHistoryEntry,
} from "../parse-compat/documents";
import { ParseConfigService } from "../parse-compat/parse-config.service";
import {
  ParseDbService,
  stripUndefined,
} from "../parse-compat/parse-db.service";
import { RolesService } from "../parse-compat/roles.service";
import type {
  ReasonedCaptionAction,
  ServerResponse,
} from "../shared/api-types";
import type { RequestContext } from "../shared/request-context";
import { unixSeconds } from "../shared/utils";
import { UsersService } from "../users/users.service";
import { CaptionCountersService } from "./caption-counters.service";
import { CaptionsService } from "./captions.service";

type Vote = "likes" | "dislikes";

/**
 * Likes, dislikes and reviews of captions
 */
@Injectable()
export class CaptionFeedbackService {
  constructor(
    @Inject(ParseDbService) private readonly db: ParseDbService,
    @Inject(ParseConfigService) private readonly config: ParseConfigService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(CaptionsService) private readonly captions: CaptionsService,
    @Inject(CaptionCountersService)
    private readonly counters: CaptionCountersService,
  ) {}

  private async checkCanAct(
    ctx: RequestContext,
  ): Promise<ServerResponse | null> {
    if (!ctx.user) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await this.config.isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    return null;
  }

  private async getOrCreateLikes(userId: string): Promise<CaptionLikesDoc> {
    const likesCollection = this.db.collection<CaptionLikesDoc>(
      CAPTION_LIKES_COLLECTION,
    );
    const existing = await likesCollection.findOne({ userId });
    if (existing) {
      return existing;
    }
    return this.db.create<CaptionLikesDoc>(
      CAPTION_LIKES_COLLECTION,
      { userId, likes: [], dislikes: [] },
      getAdminACL(),
    );
  }

  /**
   * Toggles a like or dislike on a caption:
   * 1. If the caption is already voted this way, the vote is removed
   * 2. Otherwise the opposite vote (if any) is removed and this vote is added
   */
  private async vote(
    captionId: string,
    vote: Vote,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    const error = await this.checkCanAct(ctx);
    if (error || !ctx.user) {
      return error as ServerResponse;
    }
    const caption = await this.captions.findById(captionId);
    if (!caption) {
      return { status: "error", error: "No such caption" };
    }
    const userId = ctx.user.id;
    if (caption.creatorId === userId) {
      return { status: "error", error: "Can't like your own caption!" };
    }
    const opposite: Vote = vote === "likes" ? "dislikes" : "likes";
    const likes = await this.getOrCreateLikes(userId);
    const likesUpdate: {
      $pull: Partial<Record<Vote, string>>;
      $addToSet?: Partial<Record<Vote, string>>;
    } = { $pull: {} };
    const captionIncrement: Partial<Record<Vote, number>> = {};
    if ((likes[vote] || []).includes(caption._id)) {
      likesUpdate.$pull[vote] = caption._id;
      captionIncrement[vote] = -1;
    } else {
      if ((likes[opposite] || []).includes(caption._id)) {
        likesUpdate.$pull[opposite] = caption._id;
        captionIncrement[opposite] = -1;
      }
      likesUpdate.$addToSet = { [vote]: caption._id };
      captionIncrement[vote] = 1;
    }
    if (Object.keys(likesUpdate.$pull).length === 0) {
      delete (likesUpdate as { $pull?: unknown }).$pull;
    }
    await this.db.updateById<CaptionLikesDoc>(
      CAPTION_LIKES_COLLECTION,
      likes._id,
      likesUpdate as never,
    );
    await this.db.updateById<CaptionDoc>(CAPTIONS_COLLECTION, caption._id, {
      $inc: captionIncrement,
    });
    await this.counters.onCaptionSaved(caption, caption.privacy);
    return { status: "success" };
  }

  async likeCaption(
    captionId: string,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    return this.vote(captionId, "likes", ctx);
  }

  async dislikeCaption(
    captionId: string,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    return this.vote(captionId, "dislikes", ctx);
  }

  private async review(
    { captionId, reason }: ReasonedCaptionAction,
    ctx: RequestContext,
    action: "reject" | "verify",
  ): Promise<ServerResponse> {
    const error = await this.checkCanAct(ctx);
    if (error || !ctx.user) {
      return error as ServerResponse;
    }
    const caption = await this.captions.findById(captionId);
    if (!caption) {
      return { status: "error", error: "No such caption" };
    }
    const userId = ctx.user.id;
    const isAdmin = await this.roles.hasAdminRole(userId);
    const isReviewer = await this.roles.hasReviewerRole(userId);
    if (!isAdmin && !isReviewer) {
      return { status: "error", error: "Not authorized!" };
    }
    const reviewer = await this.users.getUserProfile(userId);
    const updates: Partial<CaptionDoc> = {};
    let entry: ReviewHistoryEntry;
    const base = {
      reviewerId: userId,
      reviewerName: reviewer?.name,
      date: unixSeconds(new Date()),
    };
    if (action === "reject") {
      if (caption.rejected) {
        updates.rejected = false;
        entry = { ...base, newState: "unrejected", reason };
      } else {
        // Rejecting a caption will cause it to be unverified
        updates.rejected = true;
        updates.verified = false;
        entry = { ...base, newState: "rejected", reason };
      }
    } else if (caption.verified) {
      updates.verified = false;
      entry = { ...base, newState: "unverified", reason };
    } else {
      // Verifying a caption will cause it to be unrejected
      updates.verified = true;
      updates.rejected = false;
      entry = { ...base, newState: "verified" };
    }
    await this.db.updateById<CaptionDoc>(CAPTIONS_COLLECTION, caption._id, {
      $set: updates,
      $push: { reviewHistory: stripUndefined(entry) },
    } as never);
    await this.counters.onCaptionSaved(caption, caption.privacy);
    return { status: "success" };
  }

  async rejectCaption(
    params: ReasonedCaptionAction,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    return this.review(params, ctx, "reject");
  }

  async verifyCaption(
    params: ReasonedCaptionAction,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    return this.review(params, ctx, "verify");
  }
}
