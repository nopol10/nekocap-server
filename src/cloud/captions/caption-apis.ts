import type { LoadPrivateCaptionerDataResponse } from "@/common/feature/captioner/types";
import type { LoadCaptionsResult } from "@/common/feature/video/types";
import type {
  CaptionSchema,
  CaptionerSchema,
  LoadSingleCaptionResponse,
} from "@/common/providers/parse/types";
import { isInMaintenanceMode } from "../config";
import { ERROR_MESSAGES, PARSE_CLASS } from "../constants";
import { canViewCaption, hasAdminRole, isTruthy } from "../utils";
import { loadCaption } from "./load-caption";

/**
 * Load the list of captions available for a video
 */
Parse.Cloud.define(
  "findCaptions",
  async (request): Promise<LoadCaptionsResult[]> => {
    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    query
      .notEqualTo("rejected", true)
      .equalTo("videoId", request.params.videoId)
      .equalTo("videoSource", request.params.videoSource.toString());
    const results = await query.find({ useMasterKey: true });
    return (
      await Promise.all(
        results.map(async (result): Promise<LoadCaptionsResult | undefined> => {
          if (!canViewCaption(result, request.user?.id)) {
            return undefined;
          }
          const captionerId = result.get("creatorId");
          const userQuery = new Parse.Query<CaptionerSchema>(
            PARSE_CLASS.captioner,
          );
          userQuery.equalTo("userId", captionerId);
          const userResult = await userQuery.find();
          let username = "";
          // Checking the results in case the captioner has somehow been deleted
          if (userResult.length > 0) {
            username = userResult[0].get("name");
          }

          return <LoadCaptionsResult>{
            id: result.id,
            captionerId,
            captionerName: username,
            verified: result.get("verified") || false,
            likes: result.get("likes") || 0,
            dislikes: result.get("dislikes") || 0,
            languageCode: result.get("language"),
            tags: result.get("tags") || [],
            advanced: !!result.get("rawContent"),
          };
        }),
      )
    ).filter(isTruthy);
  },
);

Parse.Cloud.define(
  "loadCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>,
  ): Promise<LoadSingleCaptionResponse> => {
    const { captionId } = request.params;
    const caption = await loadCaption(captionId);
    if (!caption) {
      return {
        status: "error",
        error: "Caption not found",
      } as LoadSingleCaptionResponse;
    }
    return { status: "success", ...caption };
  },
);

Parse.Cloud.define(
  "deleteCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>,
  ): Promise<LoadPrivateCaptionerDataResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { captionId } = request.params;
    const isAdmin = await hasAdminRole(request.user);

    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    query.equalTo("objectId", captionId);
    const caption = await query.first({ useMasterKey: true });
    if (!caption) {
      return { status: "error", error: "Unknown caption" };
    }
    const sessionToken = request.user.getSessionToken();
    let useMasterKey = isAdmin;
    // Since the creator of a caption is not granted write access to the caption object, we'll use the master key let them
    // delete their own caption
    if (request.user.id === caption.get("creatorId")) {
      useMasterKey = true;
    }
    await caption.destroy({ sessionToken, useMasterKey });

    return {
      status: "success",
    };
  },
);
