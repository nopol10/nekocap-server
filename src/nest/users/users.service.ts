import { Inject, Injectable } from "@nestjs/common";
import {
  CAPTIONER_COLLECTION,
  CAPTIONER_PRIVATE_COLLECTION,
  USER_COLLECTION,
} from "../constants";
import {
  getAdminACL,
  getPublicReadAdminACL,
  getUserReadAdminACL,
  getUserReadAdminPublicACL,
} from "../parse-compat/acl";
import type {
  CaptionerDoc,
  CaptionerPrivateDoc,
  UserDoc,
} from "../parse-compat/documents";
import { ParseDbService } from "../parse-compat/parse-db.service";
import { RolesService } from "../parse-compat/roles.service";
import type {
  CaptionerFields,
  CaptionerPrivateFields,
} from "../shared/api-types";
import { getCaptionGroupTagName } from "../shared/caption-tags";

// The name tag given to captioners that haven't picked a name yet
const DEFAULT_NAME_TAG = 99999;

@Injectable()
export class UsersService {
  constructor(
    @Inject(ParseDbService) private readonly db: ParseDbService,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  private captioners() {
    return this.db.collection<CaptionerDoc>(CAPTIONER_COLLECTION);
  }

  async findUser(userId: string): Promise<UserDoc | null> {
    return this.db
      .collection<UserDoc>(USER_COLLECTION)
      .findOne({ _id: userId });
  }

  async findCaptioner(userId: string): Promise<CaptionerDoc | null> {
    return this.captioners().findOne({ userId });
  }

  /**
   * Creates the public and private captioner records of a new user.
   * Ported from the `_User` afterSave hook, but idempotent so that it can be
   * called for both Parse and NestJS created users.
   */
  async ensureCaptionerRecords(userId: string): Promise<void> {
    if (!(await this.captioners().findOne({ userId }))) {
      await this.db.create<CaptionerDoc>(
        CAPTIONER_COLLECTION,
        { userId, nameTag: DEFAULT_NAME_TAG },
        getUserReadAdminPublicACL(userId),
      );
    }
    const privateCollection = this.db.collection<CaptionerPrivateDoc>(
      CAPTIONER_PRIVATE_COLLECTION,
    );
    if (!(await privateCollection.findOne({ captionerId: userId }))) {
      await this.db.create<CaptionerPrivateDoc>(
        CAPTIONER_PRIVATE_COLLECTION,
        { captionerId: userId },
        getUserReadAdminACL(userId),
      );
    }
  }

  /**
   * Creates a captioner that isn't linked to a user yet (used by migrations)
   */
  async createCaptionerWithoutUser(name: string, email: string): Promise<void> {
    const captioner = await this.db.create<CaptionerDoc>(
      CAPTIONER_COLLECTION,
      { userId: "undefined", name, nameTag: DEFAULT_NAME_TAG },
      getPublicReadAdminACL(),
    );
    // captionerId for captionerPrivates without users are special, they point
    // to the captioner's id instead of the user id so that they can later be
    // linked if needed.
    await this.db.create<CaptionerPrivateDoc>(
      CAPTIONER_PRIVATE_COLLECTION,
      { captionerId: captioner._id, email },
      getAdminACL(),
    );
  }

  /**
   * The public profile of a captioner
   */
  async getUserProfile(userId: string): Promise<CaptionerFields | undefined> {
    if (!userId) {
      return undefined;
    }
    const captioner = await this.findCaptioner(userId);
    if (!captioner) {
      return undefined;
    }
    const user = await this.findUser(userId);
    const roles = user
      ? await this.roles.getUserRoles(userId)
      : { isAdmin: false, isReviewer: false, isReviewerManager: false };
    return {
      name: captioner.name,
      nameTag: captioner.nameTag,
      profileMessage: captioner.profileMessage,
      recs: captioner.recs,
      userId,
      verified: captioner.verified,
      banned: captioner.banned,
      lastSubmissionTime: captioner.lastSubmissionTime || 0,
      donationLink: captioner.donationLink,
      languageCodes: captioner.languages,
      captionCount: captioner.captionCount || 0,
      captionTags: captioner.captionTags || [],
      ...roles,
    };
  }

  /**
   * The private profile of a captioner, only available when the private
   * captioner record exists
   */
  async getUserPrivateProfile(
    userId: string,
  ): Promise<CaptionerPrivateFields | undefined> {
    const privateData = await this.db
      .collection<CaptionerPrivateDoc>(CAPTIONER_PRIVATE_COLLECTION)
      .findOne({ captionerId: userId });
    if (!privateData) {
      return undefined;
    }
    const user = await this.findUser(userId);
    if (!user) {
      return { isAdmin: false, isReviewer: false, isReviewerManager: false };
    }
    return this.roles.getUserRoles(userId);
  }

  /**
   * Adds the group tags that the captioner doesn't have yet to their list of
   * tags. Tags are matched by name.
   */
  async addMissingCaptionTags(userId: string, tags?: string[]): Promise<void> {
    if (!userId || !tags || tags.length <= 0) {
      return;
    }
    const captioner = await this.findCaptioner(userId);
    if (!captioner) {
      return;
    }
    const existingTags = captioner.captionTags || [];
    const existingNames = new Set(existingTags.map(getCaptionGroupTagName));
    const newTags: string[] = [];
    for (const tag of tags) {
      const name = getCaptionGroupTagName(tag);
      if (!name || existingNames.has(name)) {
        continue;
      }
      existingNames.add(name);
      newTags.push(tag);
    }
    await this.db.updateById<CaptionerDoc>(
      CAPTIONER_COLLECTION,
      captioner._id,
      {
        $set: { captionTags: [...existingTags, ...newTags] },
      },
    );
  }
}
