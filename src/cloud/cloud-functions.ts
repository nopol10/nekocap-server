/**
 * Every cloud function the NekoCap clients (and migration scripts) call.
 * Each one runs the NestJS service backing the equivalent REST endpoint.
 */
export const CLOUD_FUNCTIONS = [
  "findCaptions",
  "loadCaption",
  "submitCaption",
  "updateCaption",
  "loadPrivateCaptionerData",
  "loadUserCaptions",
  "updateCaptionerProfile",
  "loadProfile",
  "deleteCaption",
  "likeCaption",
  "dislikeCaption",
  "rejectCaption",
  "verifyCaption",
  "loadLatestCaptions",
  "loadLatestLanguageCaptions",
  "loadPopularCaptions",
  "loadCaptionForReview",
  "assignReviewerRole",
  "assignReviewerManagerRole",
  "search",
  "verifyCaptioner",
  "banCaptioner",
  "browse",
  "getOwnProfileTags",
  "deleteProfileTag",
  "globalStats",
  "getAutoCaptionList",
  // Migrations (master key only)
  "createVideo",
  "createBatchYoutubeVideos",
  "migrationCreateCaptionerWithoutUser",
  "migrationCreateCaption",
];
