export const SINGLETON_ID = "homepage";

export const HOMEPAGE_STATS_COLLECTION = "homepageStats";

export const CAPTIONS_COLLECTION = "captions";

export const VIDEOS_COLLECTION = "videos";

export const CAPTIONER_COLLECTION = "captioner";

export const CAPTIONER_PRIVATE_COLLECTION = "captionerPrivate";

export const CAPTION_LIKES_COLLECTION = "captionLikes";

// Parse's system collections
export const USER_COLLECTION = "_User";

export const SESSION_COLLECTION = "_Session";

export const ROLE_COLLECTION = "_Role";

export const ROLE_USERS_JOIN_COLLECTION = "_Join:users:_Role";

export const GLOBAL_CONFIG_COLLECTION = "_GlobalConfig";

export const SCHEMA_COLLECTION = "_SCHEMA";

// Mirrors the entries of videoSourceToProcessorMap in nekocap's
// src/common/feature/video/utils.ts. NekoCapYoutube is a YouTube
// subset (see VIDEO_SOURCE_MIGRATION_MAP) so we exclude it from the
// "supported sites" count shown on the homepage.
export const TOTAL_SUPPORTED_SITES = 22;

export const NEST_API_PREFIX = "/api/v1";

// Matches Parse Server's maxUploadSize so that caption payloads that Parse
// accepted are also accepted by the REST API
export const MAX_REQUEST_BODY_SIZE = "100mb";

export const floorTo = (value: number, step: number): number =>
  Math.floor(value / step) * step;

// Mirrors ERROR_MESSAGES in src/cloud/constants.ts. Clients match on some of
// these strings so they must stay the same.
export const ERROR_MESSAGES = {
  MAINTENANCE: "Sorry, we are in maintenance mode. Please try again later.",
  NOT_LOGGED_IN: "Not authorized! Please login",
  BANNED: "Not authorized! You are banned!",
};

export const CAPTION_SUBMISSION_COOLDOWN = 5 * 60 * 1000;

export const MAX_CAPTION_GROUP_TAG_NAME_LENGTH = 64;

export const MAX_CAPTION_GROUP_TAG_LIMIT = 5;

export const MAX_SEARCH_TAG_LIMIT = 5;

/**
 * Caps the length of the video title filter used when listing a captioner's
 * captions.
 */
export const MAX_CAPTION_TITLE_FILTER_LENGTH = 100;

export const ROLES = {
  reviewer: "reviewer",
  reviewerManager: "reviewerManager",
  admin: "admin",
  superadmin: "superadmin",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
