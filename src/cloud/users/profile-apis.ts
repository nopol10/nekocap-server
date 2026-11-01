import type {
  CaptionsRequest,
  CaptionsResponse,
  LoadPrivateCaptionerDataRequestParams,
  LoadPrivateCaptionerDataResponse,
  UpdateCaptionerProfileParams,
} from "@/common/feature/captioner/types";
import type { LoadProfileParams } from "@/common/feature/profile/types";
import type { CaptionListFields } from "@/common/feature/video/types";
import type {
  CaptionerPrivateSchema,
  CaptionerSchema,
  PublicProfileResponse,
} from "@/common/providers/parse/types";
import { random } from "lodash-es";
import { getCaptionerCaptions } from "../captions/get-captions";
import { isInMaintenanceMode } from "../config";
import { ERROR_MESSAGES, PARSE_CLASS } from "../constants";
import { hasAdminRole } from "../utils";
import { getUserPrivateProfile } from "./get-user-private-profile";
import { getUserProfile } from "./get-user-profile";

/**
 * All data needed for the frontend dashboard after a user logs in
 * Returns the list of captions belonging to the user
 */
Parse.Cloud.define(
  "loadPrivateCaptionerData",
  async (
    request: Parse.Cloud.FunctionRequest<LoadPrivateCaptionerDataRequestParams>,
  ): Promise<LoadPrivateCaptionerDataResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    const { withCaptions = true } = request.params;
    const userId = request.user.id;
    const { result: outputSubs } = withCaptions
      ? await getCaptionerCaptions({
          captionerId: userId,
          limit: 50,
          offset: 0,
          userId: request.user.id,
          tags: [],
        })
      : { result: <CaptionListFields[]>[] };
    const profile = await getUserProfile(userId);
    const privateProfile = await getUserPrivateProfile(
      request.user.id,
      request.user.getSessionToken(),
      false,
    );
    return {
      status: "success",
      captions: outputSubs,
      captioner: profile,
      privateProfile: privateProfile,
    };
  },
);

/**
 * Loads the list of a specific user's captions
 */
Parse.Cloud.define(
  "loadUserCaptions",
  async (
    request: Parse.Cloud.FunctionRequest<CaptionsRequest>,
  ): Promise<CaptionsResponse> => {
    const {
      captionerId,
      tags = [],
      limit,
      offset,
      advancedFilter,
      titleFilter,
    } = request.params;
    const { result: outputSubs, hasMore } = await getCaptionerCaptions({
      captionerId,
      limit: limit || 50,
      offset: offset || 0,
      userId: request.user?.id,
      tags,
      advancedFilter,
      titleFilter,
    });

    return {
      status: "success",
      captions: outputSubs,
      hasMore,
    };
  },
);

Parse.Cloud.define(
  "updateCaptionerProfile",
  async (
    request: Parse.Cloud.FunctionRequest<UpdateCaptionerProfileParams>,
  ): Promise<LoadPrivateCaptionerDataResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const {
      languageCodes,
      name,
      donationLink = "",
      profileMessage = "",
      userId: targetUserId,
    } = request.params;
    const { user } = request;
    const { id: userId } = request.user;

    const isAdmin = await hasAdminRole(user);
    if (!isAdmin && targetUserId && targetUserId !== userId) {
      // Only an admin can change someone else's profile
      return {
        status: "error",
        error: "Not authorized!",
      };
    }

    const query = new Parse.Query<CaptionerSchema>(PARSE_CLASS.captioner);
    const userIdToUpdate = targetUserId || userId;
    query.equalTo("userId", userIdToUpdate);
    const captioner = await query.first();
    if (!captioner) {
      return {
        status: "error",
        error: "Captioner not found",
      } as LoadPrivateCaptionerDataResponse;
    }
    const sessionToken = request.user.getSessionToken();
    captioner.set("donationLink", donationLink);
    captioner.set("profileMessage", profileMessage);
    captioner.set("languages", languageCodes);

    const originalName = captioner.get("name") || "";
    // Check if anyone already has the same name + nameTag. Only allow setting of name if no name exists in the first place
    if (name !== originalName && !originalName) {
      let nameIsValid = false;
      for (let nameCheckAttempt = 0; nameCheckAttempt < 3; nameCheckAttempt++) {
        const randomTag = random(9999);
        const nameCheckQuery = new Parse.Query<CaptionerSchema>(
          PARSE_CLASS.captioner,
        );
        nameCheckQuery.equalTo("name", name);
        nameCheckQuery.equalTo("nameTag", randomTag);
        nameCheckQuery.notEqualTo("userId", userIdToUpdate);
        const usersWithSameName = await nameCheckQuery.find();
        if (usersWithSameName.length <= 0) {
          captioner.set("name", name);
          captioner.set("nameTag", randomTag);
          nameIsValid = true;
          break;
        }
      }
      if (!nameIsValid) {
        return {
          status: "error",
          error: "Too many users with the same name!",
        };
      }
    }

    await captioner.save(null, { useMasterKey: true });

    const privateQuery = new Parse.Query<CaptionerPrivateSchema>(
      PARSE_CLASS.captionerPrivate,
    );
    privateQuery.equalTo("captionerId", userIdToUpdate);
    const captionerPrivateData = await privateQuery.first({ sessionToken });
    if (!captionerPrivateData) {
      return {
        status: "error",
        error: "Could not query profile data",
      };
    }
    await captionerPrivateData.save(null, { useMasterKey: true });

    const profile = await getUserProfile(userIdToUpdate);
    const privateProfile = await getUserPrivateProfile(
      userIdToUpdate,
      user.getSessionToken(),
      isAdmin,
    );
    return {
      status: "success",
      captions: [],
      captioner: profile,
      privateProfile: privateProfile,
    };
  },
);

/**
 * All data needed for the frontend dashboard after a user logs in
 * Returns the list of captions belonging to the user
 */
Parse.Cloud.define(
  "loadProfile",
  async (
    request: Parse.Cloud.FunctionRequest<LoadProfileParams>,
  ): Promise<PublicProfileResponse> => {
    const { withCaptions = true, profileId } = request.params;
    const { result: outputSubs } = withCaptions
      ? await getCaptionerCaptions({
          captionerId: profileId,
          limit: 50,
          offset: 0,
          userId: request.user?.id,
          tags: [],
        })
      : { result: <CaptionListFields[]>[] };
    const profile = await getUserProfile(profileId);
    if (!profile) {
      return {
        status: "error",
      };
    }
    return {
      status: "success",
      captions: outputSubs,
      captioner: profile,
    };
  },
);
