import { invokeCloudFunction } from "./invoke-cloud-function";
import { invokeRest } from "./invoke-rest";

/**
 * The two ways clients reach the API: legacy Parse cloud functions (older
 * extension versions) and the NestJS REST API. Contract tests run against
 * both to make sure they behave identically.
 */
export type Transport = "parse" | "rest";

export const TRANSPORTS: Transport[] = ["parse", "rest"];

type Params = Record<string, any>;

type RestCall = (params: Params, sessionToken?: string) => Promise<unknown>;

/**
 * Maps each cloud function to its REST endpoint, the same way nekocap's
 * NestJsProvider does
 */
const REST_CALLS: Record<string, RestCall> = {
  findCaptions: ({ videoId, videoSource }, sessionToken) =>
    invokeRest("GET", "/captions", {
      query: { videoId, videoSource },
      sessionToken,
    }),
  loadCaption: ({ captionId }, sessionToken) =>
    invokeRest("GET", `/captions/${captionId}`, { sessionToken }),
  loadCaptionForReview: ({ captionId }, sessionToken) =>
    invokeRest("GET", `/captions/${captionId}/review`, { sessionToken }),
  submitCaption: (params, sessionToken) =>
    invokeRest("POST", "/captions", { body: params, sessionToken }),
  updateCaption: ({ captionId, ...params }, sessionToken) =>
    invokeRest("PATCH", `/captions/${captionId}`, {
      body: params,
      sessionToken,
    }),
  deleteCaption: ({ captionId }, sessionToken) =>
    invokeRest("DELETE", `/captions/${captionId}`, { sessionToken }),
  likeCaption: ({ captionId }, sessionToken) =>
    invokeRest("POST", `/captions/${captionId}/like`, { sessionToken }),
  dislikeCaption: ({ captionId }, sessionToken) =>
    invokeRest("POST", `/captions/${captionId}/dislike`, { sessionToken }),
  rejectCaption: ({ captionId, reason }, sessionToken) =>
    invokeRest("POST", `/captions/${captionId}/reject`, {
      body: { reason },
      sessionToken,
    }),
  verifyCaption: ({ captionId, reason }, sessionToken) =>
    invokeRest("POST", `/captions/${captionId}/verify`, {
      body: { reason },
      sessionToken,
    }),
  loadLatestCaptions: () => invokeRest("GET", "/captions/latest"),
  loadLatestLanguageCaptions: ({ languageCode }) =>
    invokeRest("GET", `/captions/latest/${languageCode}`),
  loadPopularCaptions: (_, sessionToken) =>
    invokeRest("GET", "/captions/popular", { sessionToken }),
  browse: ({ limit, offset }) =>
    invokeRest("GET", "/captions/browse", { query: { limit, offset } }),
  loadUserCaptions: ({ captionerId, ...query }, sessionToken) =>
    invokeRest("GET", `/captioners/${captionerId}/captions`, {
      query,
      sessionToken,
    }),
  loadPrivateCaptionerData: ({ withCaptions }, sessionToken) =>
    invokeRest("GET", "/captioners/me", {
      query: { withCaptions },
      sessionToken,
    }),
  updateCaptionerProfile: (params, sessionToken) =>
    invokeRest("PATCH", "/captioners/me", { body: params, sessionToken }),
  loadProfile: ({ profileId, withCaptions }, sessionToken) =>
    invokeRest("GET", `/captioners/${profileId}`, {
      query: { withCaptions },
      sessionToken,
    }),
  verifyCaptioner: ({ targetUserId }, sessionToken) =>
    invokeRest("POST", `/captioners/${targetUserId}/verify`, { sessionToken }),
  banCaptioner: ({ targetUserId }, sessionToken) =>
    invokeRest("POST", `/captioners/${targetUserId}/ban`, { sessionToken }),
  assignReviewerRole: ({ targetUserId }, sessionToken) =>
    invokeRest("POST", `/captioners/${targetUserId}/roles/reviewer`, {
      sessionToken,
    }),
  assignReviewerManagerRole: ({ targetUserId }, sessionToken) =>
    invokeRest("POST", `/captioners/${targetUserId}/roles/reviewer-manager`, {
      sessionToken,
    }),
  getOwnProfileTags: (_, sessionToken) =>
    invokeRest("GET", "/captioners/me/tags", { sessionToken }),
  deleteProfileTag: ({ tagName }, sessionToken) =>
    invokeRest("DELETE", `/captioners/me/tags/${encodeURIComponent(tagName)}`, {
      sessionToken,
    }),
  search: (params) => invokeRest("GET", "/search", { query: params }),
  globalStats: () => invokeRest("GET", "/stats/global"),
  getAutoCaptionList: (params) =>
    invokeRest("GET", "/videos/auto-captions", { query: params }),
};

export async function invokeApi<TResponse = unknown>(
  transport: Transport,
  name: string,
  params: Params = {},
  options: { sessionToken?: string } = {},
): Promise<TResponse> {
  if (transport === "parse") {
    return invokeCloudFunction<TResponse>(name, params, options);
  }
  const call = REST_CALLS[name];
  if (!call) {
    throw new Error(`No REST mapping for ${name}`);
  }
  return (await call(params, options.sessionToken)) as TResponse;
}
