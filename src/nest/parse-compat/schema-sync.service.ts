import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CAPTION_LIKES_COLLECTION,
  CAPTIONER_COLLECTION,
  CAPTIONER_PRIVATE_COLLECTION,
  CAPTIONS_COLLECTION,
  SCHEMA_COLLECTION,
  SESSION_COLLECTION,
  USER_COLLECTION,
  VIDEOS_COLLECTION,
} from "../constants";
import { ParseDbService } from "./parse-db.service";

/**
 * The fields NestJS writes for each Parse class, in Parse's `_SCHEMA` type
 * notation (see database/nekocap-schema.json).
 */
const CLASS_FIELDS: Record<string, Record<string, string>> = {
  // Parse maps `_p_user` to the session's user only when it knows `user` is
  // a pointer, so sessions created here need the _Session schema to exist
  [USER_COLLECTION]: {
    username: "string",
    email: "string",
    emailVerified: "boolean",
    authData: "object",
  },
  [SESSION_COLLECTION]: {
    restricted: "boolean",
    user: "*_User",
    installationId: "string",
    sessionToken: "string",
    expiresAt: "date",
    createdWith: "object",
  },
  [CAPTIONS_COLLECTION]: {
    content: "string",
    creatorId: "string",
    language: "string",
    videoId: "string",
    videoSource: "string",
    verified: "boolean",
    likes: "number",
    dislikes: "number",
    rejected: "boolean",
    tags: "array",
    reviewHistory: "array",
    rawContent: "string",
    rawFile: "file",
    translatedTitle: "string",
    views: "number",
    privacy: "number",
  },
  [VIDEOS_COLLECTION]: {
    language: "string",
    name: "string",
    source: "string",
    sourceId: "string",
    captions: "object",
    captionCount: "number",
  },
  [CAPTIONER_COLLECTION]: {
    name: "string",
    profileMessage: "string",
    recs: "number",
    verified: "boolean",
    userId: "string",
    donationLink: "string",
    languages: "array",
    nameTag: "number",
    captionCount: "number",
    banned: "boolean",
    lastSubmissionTime: "number",
    // Never made it into the exported schema as Parse created it on the fly
    captionTags: "array",
  },
  [CAPTIONER_PRIVATE_COLLECTION]: {
    email: "string",
    captionerId: "string",
  },
  [CAPTION_LIKES_COLLECTION]: {
    userId: "string",
    likes: "array",
    dislikes: "array",
  },
};

const DEFAULT_FIELDS = {
  objectId: "string",
  updatedAt: "date",
  createdAt: "date",
};

/**
 * Makes sure Parse's `_SCHEMA` knows about every class and field NestJS
 * writes. Parse creates schema entries on the fly when it saves objects,
 * but NestJS writes to MongoDB directly, so without this Parse (and its
 * dashboard) would not know about fields that only NestJS has written.
 * Only missing entries are added; existing ones (and their CLPs) are left
 * untouched.
 */
@Injectable()
export class SchemaSyncService implements OnModuleInit {
  private readonly logger = new Logger(SchemaSyncService.name);

  constructor(@Inject(ParseDbService) private readonly db: ParseDbService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.sync();
    } catch (e) {
      this.logger.error("Failed to sync the Parse schema", e);
    }
  }

  async sync(): Promise<void> {
    const schemas = this.db.collection<
      { _id: string } & Record<string, unknown>
    >(SCHEMA_COLLECTION);
    for (const [className, fields] of Object.entries(CLASS_FIELDS)) {
      const existing = await schemas.findOne({ _id: className });
      const missing: Record<string, string> = {};
      for (const [field, type] of Object.entries({
        ...DEFAULT_FIELDS,
        ...fields,
      })) {
        if (!existing || existing[field] === undefined) {
          missing[field] = type;
        }
      }
      if (Object.keys(missing).length === 0) {
        continue;
      }
      await schemas.updateOne(
        { _id: className },
        { $set: missing },
        { upsert: true },
      );
    }
  }
}
