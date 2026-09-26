import type { ParseAclFields } from "./acl";

/**
 * Raw MongoDB document shapes, exactly as Parse Server stores them.
 * `_id` is Parse's 10 character objectId string and timestamps live in
 * `_created_at` / `_updated_at`.
 */
export type ParseBaseDoc = {
  _id: string;
  _created_at?: Date;
  _updated_at?: Date;
} & Partial<ParseAclFields>;

export type ReviewHistoryEntry = {
  reviewerId: string;
  reviewerName?: string;
  newState: "rejected" | "unrejected" | "verified" | "unverified";
  reason?: string;
  date: number;
};

export type CaptionDoc = ParseBaseDoc & {
  creatorId?: string;
  language?: string;
  videoId?: string;
  videoSource?: string;
  /** JSON string of the caption data */
  content?: string;
  translatedTitle?: string;
  tags?: string[];
  privacy?: number | null;
  verified?: boolean;
  rejected?: boolean;
  likes?: number;
  dislikes?: number;
  views?: number;
  reviewHistory?: ReviewHistoryEntry[];
  /** JSON string of the raw caption's meta data ({type, data: ""}) */
  rawContent?: string | null;
  /** Name of the raw caption's file in GridFS (Parse's File field format) */
  rawFile?: string | null;
};

export type VideoDoc = ParseBaseDoc & {
  sourceId?: string;
  source?: string;
  name?: string;
  language?: string;
  sourceCreatorId?: string;
  captions?: Record<string, number>;
  captionCount?: number;
};

export type CaptionerDoc = ParseBaseDoc & {
  userId?: string;
  name?: string;
  nameTag?: number;
  profileMessage?: string;
  recs?: number;
  verified?: boolean;
  banned?: boolean;
  lastSubmissionTime?: number;
  donationLink?: string;
  languages?: string[];
  captionCount?: number;
  captionTags?: string[];
};

export type CaptionerPrivateDoc = ParseBaseDoc & {
  captionerId?: string;
  email?: string;
};

export type CaptionLikesDoc = ParseBaseDoc & {
  userId?: string;
  likes?: string[];
  dislikes?: string[];
};

export type UserDoc = ParseBaseDoc & {
  username?: string;
  email?: string;
  _hashed_password?: string;
  // Parse also stores each auth provider's data as `_auth_data_<provider>`
};

export type SessionDoc = ParseBaseDoc & {
  _session_token: string;
  /** Parse pointer format: `_User$<userId>` */
  _p_user: string;
  createdWith?: { action: string; authProvider?: string };
  restricted?: boolean;
  expiresAt?: Date;
  installationId?: string;
};

export type RoleDoc = ParseBaseDoc & {
  name: string;
};

export type RoleJoinDoc = {
  owningId: string;
  relatedId: string;
};

export type GlobalConfigDoc = {
  _id: number;
  params?: Record<string, unknown>;
  masterKeyOnly?: Record<string, boolean>;
};
