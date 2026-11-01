import type {
  ReasonedCaptionAction,
  ReviewActionDetails,
} from "@/common/feature/caption-review/types";
import type {
  CaptionSchema,
  LoadCaptionForReviewResponse,
} from "@/common/providers/parse/types";
import type { ServerResponse } from "@/common/types";
import { isInMaintenanceMode } from "../config";
import { ERROR_MESSAGES, PARSE_CLASS } from "../constants";
import { getUserProfile } from "../users/get-user-profile";
import { hasAdminRole, hasReviewerRole, unixSeconds } from "../utils";
import { loadCaption, loadVideo } from "./load-caption";

/**
 * Reject a contributed caption
 */
Parse.Cloud.define(
  "rejectCaption",
  async (
    request: Parse.Cloud.FunctionRequest<ReasonedCaptionAction>,
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { captionId: captionId, reason } = request.params;

    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    query.equalTo("objectId", captionId);
    const caption = await query.first({ useMasterKey: true });
    if (!caption) {
      // Try to like a caption that doesn't exist
      return { status: "error", error: "No such caption" };
    }
    const { user } = request;

    const isAdmin = await hasAdminRole(user);
    const isReviewer = await hasReviewerRole(user);
    if (!isAdmin && !isReviewer) {
      return { status: "error", error: "Not authorized!" };
    }

    const rejector = await getUserProfile(user.id);

    if (caption.get("rejected")) {
      // Already rejected, unreject it
      caption.set("rejected", false);
      caption.add("reviewHistory", <ReviewActionDetails>{
        reviewerId: user.id,
        reviewerName: rejector?.name,
        newState: "unrejected",
        reason,
        date: unixSeconds(new Date()),
      });
    } else {
      caption.set("rejected", true);
      // Rejecting a caption will cause it to be unverified
      caption.set("verified", false);
      caption.add("reviewHistory", <ReviewActionDetails>{
        reviewerId: user.id,
        reviewerName: rejector?.name,
        newState: "rejected",
        reason,
        date: unixSeconds(new Date()),
      });
    }

    // Save with master key as only the caption creator (and admins) can modify a caption object
    await caption.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  },
);

/**
 * Verify a contributed caption
 */
Parse.Cloud.define(
  "verifyCaption",
  async (
    request: Parse.Cloud.FunctionRequest<ReasonedCaptionAction>,
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { captionId: captionId, reason } = request.params;

    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    query.equalTo("objectId", captionId);
    const caption = await query.first({ useMasterKey: true });
    if (!caption) {
      // Try to like a caption that doesn't exist
      return { status: "error", error: "No such caption" };
    }
    const { user } = request;

    const isAdmin = await hasAdminRole(user);
    const isReviewer = await hasReviewerRole(user);
    if (!isAdmin && !isReviewer) {
      return { status: "error", error: "Not authorized!" };
    }

    const rejector = await getUserProfile(user.id);

    if (caption.get("verified")) {
      // Already verified, unverify it
      caption.set("verified", false);
      caption.add("reviewHistory", <ReviewActionDetails>{
        reviewerId: user.id,
        reviewerName: rejector?.name,
        reason,
        newState: "unverified",
        date: unixSeconds(new Date()),
      });
    } else {
      caption.set("verified", true);
      // Verifying a caption will cause it to be unrejected
      caption.set("rejected", false);
      caption.add("reviewHistory", <ReviewActionDetails>{
        reviewerId: user.id,
        reviewerName: rejector?.name,
        newState: "verified",
        date: unixSeconds(new Date()),
      });
    }

    // Save with master key as only the caption creator (and admins) can modify a caption object
    await caption.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  },
);

Parse.Cloud.define(
  "loadCaptionForReview",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>,
  ): Promise<LoadCaptionForReviewResponse> => {
    const { captionId } = request.params;
    const caption = await loadCaption(captionId);
    if (!caption) {
      return {
        status: "error",
        error: "Caption not found",
      } as LoadCaptionForReviewResponse;
    }
    const { user } = request;
    if (!user) {
      return {
        status: "error",
        error: ERROR_MESSAGES.NOT_LOGGED_IN,
      } as LoadCaptionForReviewResponse;
    }

    const isAdmin = await hasAdminRole(user);
    const isReviewer = await hasReviewerRole(user);
    if (!isAdmin && !isReviewer) {
      return {
        status: "error",
        error: "Not authorized",
      } as LoadCaptionForReviewResponse;
    }

    const userProfile = await getUserProfile(caption.caption.get("creatorId"));
    const video = await loadVideo(
      caption.caption.get("videoId"),
      caption.caption.get("videoSource"),
    );
    const videoName = video ? video.get("name") : "";
    return <LoadCaptionForReviewResponse>{
      status: "success",
      caption: caption.caption,
      captioner: userProfile,
      videoName,
    };
  },
);
