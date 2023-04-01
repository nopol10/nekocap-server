/// <reference path="../../../nekocap/src/declarations.d.ts" />
// Above is needed due to references to globalThis in shared imports
import type {
  LoadCaptionsResult,
  SubmitCaptionRequest,
  CaptionListFields,
  RawCaptionData,
  UpdateCaptionRequest,
} from "@/common/feature/video/types";
import { CaptionPrivacy } from "@/common/feature/video/types";
import type { LoadProfileParams } from "@/common/feature/profile/types";
import type {
  CaptionLikesSchema,
  CaptionSchema,
  CaptionerPrivateSchema,
  CaptionerSchema,
  LoadSingleCaptionResponse,
  ServerSingleCaption,
  VideoSchema,
  VideoSearchResponse,
  LoadCaptionForReviewResponse,
  PublicProfileResponse,
  BrowseResponse,
} from "@/common/providers/parse/types";
import type {
  CaptionsRequest,
  CaptionerFields,
  CaptionerPrivateFields,
  LoadPrivateCaptionerDataResponse,
  UpdateCaptionerProfileParams,
  CaptionsResponse,
  RoleRequest,
  LoadPrivateCaptionerDataRequestParams,
  VerifyRequest,
} from "@/common/feature/captioner/types";
import type {
  ReasonedCaptionAction,
  ReviewActionDetails,
} from "@/common/feature/caption-review/types";
import type { SearchRequest } from "@/common/feature/search/types";
import type { BrowseRequest } from "@/common/feature/public-dashboard/types";
import {
  canViewCaption,
  escapeRegexInString,
  getRelatedLanguageCodes,
  getVideoName,
  hasAdminRole,
  hasReviewerManagerRole,
  hasReviewerRole,
  isUndefinedOrNull,
  unixSeconds,
} from "./utils";
import { random } from "lodash";
import { decompressFromBase64 } from "lz-string";
import { getAdminACL, getPublicReadAdminReviewerACL } from "./acl";
import "./hooks.ts";
import "./video-apis.ts";
import "./migration.ts";
import "./stats.ts";
import type {
  CaptionFileFormat,
  ServerResponse,
  UploadResponse,
} from "@/common/types";
import { isAss } from "@/common/caption-utils";
import { captionTags } from "@/common/constants";
import { role } from "./roles";
import {
  MAX_CAPTION_FILE_BYTES,
  MAX_VERIFIED_CAPTION_FILE_BYTES,
  MAX_VIDEO_TITLE_LENGTH,
} from "@/common/feature/caption-editor/constants";
import sanitizeFilename from "sanitize-filename";
import {
  CAPTION_SUBMISSION_COOLDOWN,
  ERROR_MESSAGES,
  MAX_CAPTION_GROUP_TAG_LIMIT,
  PARSE_CLASS,
} from "./constants";
import { validateAss } from "./validator";
import {
  getVideoByCaptionTitleQuery,
  getVideoByTitleQuery,
  getVideoByVideoIdQuery,
} from "./search";
import { isInMaintenanceMode } from "./config";
import { languages } from "@/common/languages";
import { captionToListFields } from "./captions/caption-to-list-field";
import { getUserProfile } from "./users/get-user-profile";
import { getCaptions, getCaptionerCaptions } from "./captions/get-captions";
import { addMissingCaptionTags } from "./users/add-missing-tags";
import { sanitizeTag } from "./utils/sanitize-tag";
import "./users/user-apis";
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
        results.map(async (result) => {
          if (!canViewCaption(result, request.user?.id)) {
            return undefined;
          }
          const captionerId = result.get("creatorId");
          const userQuery = new Parse.Query<CaptionerSchema>(
            PARSE_CLASS.captioner
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
        })
      )
    ).filter(Boolean);
  }
);

const loadRawCaptionData = async (caption: CaptionSchema): Promise<string> => {
  const file: Parse.File | undefined = caption.get("rawFile");
  if (!file) {
    return "";
  }
  let rawContent = caption.get("rawContent");
  if (!rawContent) {
    return "";
  }
  rawContent = JSON.parse(rawContent);
  const fileData = await file.getData();
  if (!fileData) {
    return "";
  }
  rawContent.data = fileData;
  return JSON.stringify(rawContent);
};

const loadRawCaptionUrl = async (
  caption: CaptionSchema
): Promise<{ url: string; type?: keyof typeof CaptionFileFormat }> => {
  const file: Parse.File | undefined = caption.get("rawFile");
  if (!file) {
    return { url: "" };
  }
  let rawContent = caption.get("rawContent");
  if (!rawContent) {
    return { url: "" };
  }
  const parsedRawContent: RawCaptionData = JSON.parse(rawContent);

  return {
    url: file.url() || "",
    type: parsedRawContent.type,
  };
};

const loadCaption = async (
  captionId: string,
  user?: Parse.User
): Promise<ServerSingleCaption | undefined> => {
  const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
  query.equalTo("objectId", captionId);
  const caption = await query.first({ useMasterKey: true });
  if (!caption) {
    return undefined;
  }
  caption.increment("views");
  // We'll send the url back and let the client retrieve it
  // We cannot get the file inside cloud code when it is running in docker as the file's url contains under the server's public IP.
  // Connecting to a docker host's public IP from inside a docker container running in that host leads to a timeout
  const rawCaptionMeta = (await loadRawCaptionUrl(caption)) || undefined;
  // We'll only return the raw caption for Substation Alpha formats as others do not require the original for rendering
  const rawCaptionUrl = isAss(rawCaptionMeta.type) ? rawCaptionMeta.url : "";
  const rawCaption: RawCaptionData = {
    type: rawCaptionMeta.type,
    data: "",
  };

  const [video, captioner, _] = await Promise.all([
    loadVideo(caption.get("videoId"), caption.get("videoSource")),
    getUserProfile(caption.get("creatorId")),
    caption.save(null, { useMasterKey: true }),
  ]);
  const originalTitle = video ? video.get("name") : "";
  const captionerName = captioner?.name ?? "Unknown";
  // Get like and dislike data if user is logged in
  if (!user || !user.getSessionToken()) {
    return {
      caption,
      rawCaption: JSON.stringify(rawCaption),
      rawCaptionUrl: rawCaptionUrl,
      originalTitle,
      captionerName,
    };
  }

  const { id: userId } = user;
  const sessionToken = user.getSessionToken();
  const likesQuery = new Parse.Query<CaptionLikesSchema>(
    PARSE_CLASS.captionLikes
  );
  likesQuery.equalTo("userId", userId);
  const likesObjects = await likesQuery.find({ sessionToken });
  let likesObject: CaptionLikesSchema;
  if (!likesObjects || likesObjects.length <= 0) {
    return {
      caption,
      rawCaptionUrl: rawCaptionUrl,
      originalTitle,
      captionerName,
    };
  }
  likesObject = likesObjects[0];
  const userLike = (likesObject.get("likes") || []).includes(captionId);
  const userDislike = (likesObject.get("dislikes") || []).includes(captionId);

  return {
    caption,
    rawCaptionUrl: rawCaptionUrl,
    userLike,
    userDislike,
    originalTitle,
    captionerName,
  };
};

const loadVideo = async (videoId: string, videoSource: string) => {
  const videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
  videoQuery.equalTo("sourceId", videoId);
  videoQuery.equalTo("source", videoSource);
  return await videoQuery.first();
};

Parse.Cloud.define(
  "loadCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>
  ): Promise<LoadSingleCaptionResponse> => {
    const { captionId } = request.params;
    const caption = await loadCaption(captionId);
    if (!caption) {
      return undefined;
    }
    return { status: "success", ...caption };
  }
);

Parse.Cloud.define(
  "submitCaption",
  async (
    request: Parse.Cloud.FunctionRequest<SubmitCaptionRequest>
  ): Promise<UploadResponse> => {
    const { user } = request;
    if (!user || !user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    let newCaptionId: string | undefined = undefined;
    try {
      const { banned, verified, lastSubmissionTime, name } =
        await getUserProfile(user.id);
      if (banned) {
        return { status: "error", error: ERROR_MESSAGES.BANNED };
      }
      if (!name) {
        return {
          status: "error",
          error:
            "Complete your profile by opening the extension in your browser before submitting a caption!",
        };
      }
      if (
        !verified &&
        Date.now() - lastSubmissionTime < CAPTION_SUBMISSION_COOLDOWN
      ) {
        return {
          status: "error",
          error: `You cannot submit another caption yet. Please wait at least 5 minutes after a submission before submitting again.`,
        };
      }
      const {
        caption,
        rawCaption,
        video,
        hasAudioDescription,
        privacy = CaptionPrivacy.Public,
      } = request.params;
      const stringifiedCaption = JSON.stringify(caption.data);
      // We only want to store the raws of ass captions
      const rawCaptionData =
        rawCaption && isAss(rawCaption.type) && rawCaption.data
          ? rawCaption.data
          : "";
      if (
        rawCaptionData &&
        // Skip validation of ass files for verified users
        // Some complex files can have invalid data but still work
        !verified &&
        !validateAss(decompressFromBase64(rawCaptionData))
      ) {
        return {
          status: "error",
          error: "Invalid .ass/.ssa file",
        };
      }
      const stringifiedRawCaption = JSON.stringify(rawCaptionData);
      const captionContentLength = Buffer.byteLength(stringifiedCaption);
      const rawContentLength = Buffer.byteLength(stringifiedRawCaption);
      const allowedFileSize = verified
        ? MAX_VERIFIED_CAPTION_FILE_BYTES
        : MAX_CAPTION_FILE_BYTES;
      if (
        captionContentLength > allowedFileSize ||
        rawContentLength > allowedFileSize
      ) {
        throw new Error("Captions exceed size limit!");
      }
      const source = caption.videoSource.toString();

      // Sanitize the input data a little just in case
      let {
        videoId,
        videoSource,
        languageCode: captionLanguageCode,
        translatedTitle,
      } = caption;
      let { name: videoName, languageCode: videoLanguageCode } = video;
      if (
        !translatedTitle ||
        !videoLanguageCode ||
        !captionLanguageCode ||
        videoId === undefined ||
        videoId.length <= 0 ||
        videoSource === undefined
      ) {
        throw new Error("Missing information in submitted caption!");
      }
      videoId = videoId.substring(0, 256);
      const videoSourceString = videoSource.toString().substring(0, 2);
      captionLanguageCode = captionLanguageCode.substring(0, 20);
      translatedTitle = translatedTitle.substring(0, MAX_VIDEO_TITLE_LENGTH);

      videoLanguageCode = (videoLanguageCode || "").substring(0, 20);

      // A user cannot have more than 2 captions of the same language for each video
      const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
      query.equalTo("videoId", videoId);
      query.equalTo("videoSource", source);
      query.equalTo("creatorId", user.id);
      query.equalTo("language", captionLanguageCode);
      const result = await query.find({ useMasterKey: true });
      if (result.length >= 2) {
        throw new Error(
          "You already have 2 captions of the same language for this video!"
        );
      }

      // Create the corresponding video object for this element
      const videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
      videoQuery.equalTo("sourceId", videoId);
      videoQuery.equalTo("source", source);
      const videoResult = await videoQuery.first();
      if (!videoResult) {
        videoName =
          (await getVideoName(videoSource, videoId)) ||
          videoName.substring(0, 100);
        const Video = Parse.Object.extend(PARSE_CLASS.videos);
        const newVideo = new Video();
        // TODO set language from video
        newVideo.set("language", videoLanguageCode);
        newVideo.set("sourceId", videoId);
        newVideo.set("source", videoSourceString);
        newVideo.set("name", videoName);
        await newVideo.save(null, { useMasterKey: true });
      }

      const tags = [];
      if (hasAudioDescription) {
        tags.push(captionTags.audioDescribed);
      }

      const Caption = Parse.Object.extend(PARSE_CLASS.captions);
      const newCaption = new Caption();
      newCaption.set("creatorId", user.id);
      newCaption.set("language", captionLanguageCode);
      newCaption.set("videoId", videoId);
      newCaption.set("videoSource", videoSourceString);
      newCaption.set("content", stringifiedCaption);
      newCaption.set("translatedTitle", translatedTitle);
      newCaption.set("tags", tags);
      newCaption.set("privacy", privacy);
      newCaption.setACL(getPublicReadAdminReviewerACL());
      await newCaption.save(null, { useMasterKey: true });

      console.log("New caption id by", user.id, ":", newCaption.id);
      newCaptionId = newCaption.id;
      if (rawCaptionData && newCaption.id) {
        let rawCaptionMeta = "";
        rawCaption.data = "";
        rawCaptionMeta = JSON.stringify(rawCaption);
        // Save the raw caption's data to a file
        let rawFile: Parse.File = new Parse.File(
          sanitizeFilename(`${newCaption.id}`),
          {
            // The raw data should already have been base64 compressed on the client's side
            base64: rawCaptionData,
          }
        );
        await rawFile.save();
        newCaption.set("rawContent", rawCaptionMeta);
        newCaption.set("rawFile", rawFile);
        await newCaption.save(null, { useMasterKey: true });
      }
    } catch (e) {
      return { status: "error", error: e.message };
    }
    return { status: "success", captionId: newCaptionId };
  }
);

Parse.Cloud.define(
  "updateCaption",
  async (
    request: Parse.Cloud.FunctionRequest<UpdateCaptionRequest>
  ): Promise<UploadResponse> => {
    const { user } = request;
    if (!user || !user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    try {
      const {
        banned,
        verified,
        captionTags: existingUserCaptionTags,
      } = await getUserProfile(user.id);
      if (banned) {
        return { status: "error", error: ERROR_MESSAGES.BANNED };
      }
      const {
        captionId,
        rawCaption: newRawCaption,
        captionData: newCaptionData,
        hasAudioDescription: newHasAudioDescription,
        translatedTitle: newTranslatedTitle,
        selectedTags = [],
        privacy: newPrivacy,
      } = request.params;
      if (!captionId) {
        return { status: "error", error: "Missing caption id!" };
      }
      if (
        isUndefinedOrNull(newRawCaption) &&
        isUndefinedOrNull(newCaptionData) &&
        isUndefinedOrNull(newHasAudioDescription) &&
        isUndefinedOrNull(newTranslatedTitle) &&
        isUndefinedOrNull(newPrivacy)
      ) {
        // Nothing needs to be updated
        return { status: "error", error: "Nothing to update" };
      }
      if (newRawCaption && newCaptionData) {
        return { status: "error", error: "Too many caption types supplied" };
      }
      const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
      query.equalTo("objectId", captionId);
      query.equalTo("creatorId", user.id);
      const existingCaption = await query.first({ useMasterKey: true });
      if (!existingCaption) {
        return { status: "error", error: "No such caption" };
      }
      // Check whether we need to delete any raw file if the caption was raw and is now not.
      const existingRawFile: Parse.File = existingCaption.get("rawFile");
      // If there's no raw caption after the update or the existing raw caption will be overwritten
      // delete the raw file
      if (
        (existingRawFile && newCaptionData && !newRawCaption) ||
        (existingRawFile && newRawCaption)
      ) {
        try {
          await existingRawFile.destroy();
        } catch (e) {
          console.warn(
            `[updateCaption] Failed to delete existing raw file for caption: ${captionId}`
          );
        }
        existingCaption.set("rawFile", null);
        existingCaption.set("rawContent", null);
      }
      if (newRawCaption) {
        existingCaption.set("content", JSON.stringify({ tracks: [] }));
      }

      const stringifiedCaption = JSON.stringify(newCaptionData || {});
      // We only want to store the raws of ass captions
      const rawCaptionData =
        newRawCaption && isAss(newRawCaption.type) && newRawCaption.data
          ? newRawCaption.data
          : "";
      if (
        rawCaptionData &&
        // Skip validation of ass files for verified users
        // Some complex files can have invalid data but still work
        !verified &&
        !validateAss(decompressFromBase64(rawCaptionData))
      ) {
        return {
          status: "error",
          error: "Invalid .ass/.ssa file",
        };
      }
      const stringifiedRawCaption = JSON.stringify(rawCaptionData);
      const captionContentLength = Buffer.byteLength(stringifiedCaption);
      const rawContentLength = Buffer.byteLength(stringifiedRawCaption);
      const allowedFileSize = verified
        ? MAX_VERIFIED_CAPTION_FILE_BYTES
        : MAX_CAPTION_FILE_BYTES;
      if (
        captionContentLength > allowedFileSize ||
        rawContentLength > allowedFileSize
      ) {
        throw new Error("Captions exceed size limit!");
      }
      // Sanitize the input data a little just in case
      // TODO: refactor sanitization code
      let modifiedTranslatedTitle = !!newTranslatedTitle
        ? newTranslatedTitle.substring(0, MAX_VIDEO_TITLE_LENGTH)
        : existingCaption.get("translatedTitle");

      // Create the corresponding video object for this element

      // #region Tags
      const tags: string[] = [];
      if (!isUndefinedOrNull(newHasAudioDescription)) {
        if (newHasAudioDescription) tags.push(captionTags.audioDescribed);
      }

      tags.push(
        ...selectedTags
          .slice(0, MAX_CAPTION_GROUP_TAG_LIMIT)
          .map((newTag) => sanitizeTag(newTag, existingUserCaptionTags))
          .filter(Boolean)
      );
      existingCaption.set("tags", tags);
      await addMissingCaptionTags(user.id, tags);
      // #region Tags

      if (!isUndefinedOrNull(newPrivacy)) {
        existingCaption.set("privacy", newPrivacy);
      }

      existingCaption.set("translatedTitle", modifiedTranslatedTitle);
      if (newCaptionData) {
        existingCaption.set("content", stringifiedCaption);
      }
      await existingCaption.save(null, { useMasterKey: true });

      if (newRawCaption && existingCaption.id) {
        let rawCaptionMeta = "";
        newRawCaption.data = "";
        rawCaptionMeta = JSON.stringify(newRawCaption);
        // Save the raw caption's data to a file
        let rawFile: Parse.File = new Parse.File(
          sanitizeFilename(`${existingCaption.id}`),
          {
            // The raw data should already have been base64 compressed on the client's side
            base64: rawCaptionData,
          }
        );
        await rawFile.save();
        existingCaption.set("rawContent", rawCaptionMeta);
        existingCaption.set("rawFile", rawFile);
        await existingCaption.save(null, { useMasterKey: true });
      }
      console.log("Updated caption id by", user.id, ":", existingCaption.id);
    } catch (e) {
      console.error("[updateCaption]", e);
      return { status: "error", error: e.message };
    }
    return { status: "success" };
  }
);

const getUserPrivateProfile = async (
  targetUserId: string,
  sessionToken: string = undefined,
  useMasterKey: boolean = undefined
): Promise<CaptionerPrivateFields> => {
  const query = new Parse.Query<CaptionerPrivateSchema>(
    PARSE_CLASS.captionerPrivate
  );
  query.equalTo("captionerId", targetUserId);
  const captioner = await query.first({
    sessionToken: sessionToken,
    useMasterKey,
  });
  if (!captioner) {
    return undefined;
  }

  const userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo("objectId", targetUserId);
  const user = await userQuery.first({ useMasterKey: true });

  const isAdmin = user ? await hasAdminRole(user) : false;
  const isReviewer = user ? await hasReviewerRole(user) : false;
  const isReviewerManager = user ? await hasReviewerManagerRole(user) : false;

  return {
    isReviewer,
    isReviewerManager,
    isAdmin,
  };
};

/**
 * All data needed for the frontend dashboard after a user logs in
 * Returns the list of captions belonging to the user
 */
Parse.Cloud.define(
  "loadPrivateCaptionerData",
  async (
    request: Parse.Cloud.FunctionRequest<LoadPrivateCaptionerDataRequestParams>
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
    const profile: CaptionerFields = await getUserProfile(userId);
    const privateProfile: CaptionerPrivateFields = await getUserPrivateProfile(
      request.user.id,
      request.user.getSessionToken(),
      false
    );
    return {
      status: "success",
      captions: outputSubs,
      captioner: profile,
      privateProfile: privateProfile,
    };
  }
);

/**
 * Loads the list of a specific user's captions
 */
Parse.Cloud.define(
  "loadUserCaptions",
  async (
    request: Parse.Cloud.FunctionRequest<CaptionsRequest>
  ): Promise<CaptionsResponse> => {
    const { captionerId, tags = [], limit, offset } = request.params;
    const { result: outputSubs, hasMore } = await getCaptionerCaptions({
      captionerId,
      limit: limit || 50,
      offset: offset || 0,
      userId: request.user?.id,
      tags,
    });

    return {
      status: "success",
      captions: outputSubs,
      hasMore,
    };
  }
);

Parse.Cloud.define(
  "updateCaptionerProfile",
  async (
    request: Parse.Cloud.FunctionRequest<UpdateCaptionerProfileParams>
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
      return undefined;
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
          PARSE_CLASS.captioner
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
      PARSE_CLASS.captionerPrivate
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

    const profile: CaptionerFields = await getUserProfile(userIdToUpdate);
    const privateProfile: CaptionerPrivateFields = await getUserPrivateProfile(
      userIdToUpdate,
      user.getSessionToken(),
      isAdmin
    );
    return {
      status: "success",
      captions: [],
      captioner: profile,
      privateProfile: privateProfile,
    };
  }
);

/**
 * All data needed for the frontend dashboard after a user logs in
 * Returns the list of captions belonging to the user
 */
Parse.Cloud.define(
  "loadProfile",
  async (
    request: Parse.Cloud.FunctionRequest<LoadProfileParams>
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
    const profile: CaptionerFields = await getUserProfile(profileId);
    return {
      status: "success",
      captions: outputSubs,
      captioner: profile,
    };
  }
);

Parse.Cloud.define(
  "deleteCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>
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
  }
);

const createCaptionLikesObject = async (
  user: Parse.User
): Promise<CaptionLikesSchema> => {
  const CaptionLikes = Parse.Object.extend(PARSE_CLASS.captionLikes);
  const captionLikes = new CaptionLikes();
  captionLikes.set("userId", user.id);
  captionLikes.set("likes", []);
  captionLikes.set("dislikes", []);
  captionLikes.setACL(getAdminACL());
  await captionLikes.save(null, { sessionToken: user.getSessionToken() });
  return captionLikes;
};

/**
 * Called when a user likes a caption
 * 0. Check whether user has an entry in the captionLikes class, if not create one
 * 1. Get the user's likes and dislikes array from the captionLikes class
 * 2. If the caption id is already in the likes array, remove it and END
 * 3. If the caption id is in the dislikes array
 *  a. Remove it from the dislikes array
 *  b. Remove a dislike from the caption
 * 4. Add it to the likes array
 * 5. Add a like to the caption
 */
Parse.Cloud.define(
  "likeCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>
  ): Promise<LoadPrivateCaptionerDataResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { captionId: captionId } = request.params;

    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    query.equalTo("objectId", captionId);
    const captions = await query.find({ useMasterKey: true });
    if (!captions || captions.length <= 0) {
      // Try to like a caption that doesn't exist
      return { status: "error", error: "No such caption" };
    }

    const userId = request.user.id;
    const caption = captions[0];
    if (caption.get("creatorId") === userId) {
      // Can't like your own caption
      return { status: "error", error: "Can't like your own caption!" };
    }

    const likesQuery = new Parse.Query<CaptionLikesSchema>(
      PARSE_CLASS.captionLikes
    );
    likesQuery.equalTo("userId", userId);
    const likesObjects = await likesQuery.find({ useMasterKey: true });
    let likesObject: CaptionLikesSchema;

    if (!likesObjects || likesObjects.length <= 0) {
      likesObject = await createCaptionLikesObject(request.user);
    } else {
      likesObject = likesObjects[0];
    }
    let likes: string[] = likesObject.get("likes") || [];
    if (likes.includes(captionId)) {
      // User already likes this caption, unlike it
      likesObject.remove("likes", captionId);
      caption.decrement("likes");
    } else {
      let dislikes: string[] = likesObject.get("dislikes") || [];
      if (dislikes.includes(captionId)) {
        likesObject.remove("dislikes", captionId);
        caption.decrement("dislikes");
      }

      likesObject.addUnique("likes", captionId);
      caption.increment("likes");
    }

    await likesObject.save(null, { useMasterKey: true });
    // Save with master key as only the caption creator (and admins) can modify a caption object
    await caption.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  }
);

/**
 * Called when a user dislikes a caption
 * 0. Check whether user has an entry in the captionLikes class, if not create one
 * 1. Get the user's likes and dislikes array from the captionLikes class
 * 2. If the caption id is already in the dislikes array, remove it and END
 * 3. If the caption id is in the likes array
 *  a. Remove it from the likes array
 *  b. Remove a like from the caption
 * 4. Add it to the dislikes array
 * 5. Add a dislike to the caption
 */
Parse.Cloud.define(
  "dislikeCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>
  ): Promise<LoadPrivateCaptionerDataResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { captionId } = request.params;

    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    query.equalTo("objectId", captionId);
    const captions = await query.find({ useMasterKey: true });
    if (!captions || captions.length <= 0) {
      // Try to like a caption that doesn't exist
      return { status: "error", error: "No such caption" };
    }

    const userId = request.user.id;
    const caption = captions[0];
    if (caption.get("creatorId") === userId) {
      // Can't dislike your own caption
      return { status: "error", error: "Can't like your own caption!" };
    }

    const likesQuery = new Parse.Query<CaptionLikesSchema>(
      PARSE_CLASS.captionLikes
    );
    likesQuery.equalTo("userId", userId);
    const likesObjects = await likesQuery.find({ useMasterKey: true });
    let likesObject: CaptionLikesSchema;
    if (!likesObjects || likesObjects.length <= 0) {
      likesObject = await createCaptionLikesObject(request.user);
    } else {
      likesObject = likesObjects[0];
    }
    let dislikes: string[] = likesObject.get("dislikes") || [];
    if (dislikes.includes(captionId)) {
      // User already likes this caption, get out with success as nothing has really "gone wrong"
      likesObject.remove("dislikes", captionId);
      caption.decrement("dislikes");
    } else {
      let likes: string[] = likesObject.get("likes") || [];
      if (likes.includes(captionId)) {
        likesObject.remove("likes", captionId);
        caption.decrement("likes");
      }

      likesObject.add("dislikes", captionId);
      caption.increment("dislikes");
    }

    await likesObject.save(null, { useMasterKey: true });
    // Save with master key as only the caption creator (and admins) can modify a caption object
    await caption.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  }
);

/**
 * Reject a contributed caption
 */
Parse.Cloud.define(
  "rejectCaption",
  async (
    request: Parse.Cloud.FunctionRequest<ReasonedCaptionAction>
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
        reviewerName: rejector.name,
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
        reviewerName: rejector.name,
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
  }
);

/**
 * Verify a contributed caption
 */
Parse.Cloud.define(
  "verifyCaption",
  async (
    request: Parse.Cloud.FunctionRequest<ReasonedCaptionAction>
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
        reviewerName: rejector.name,
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
        reviewerName: rejector.name,
        newState: "verified",
        date: unixSeconds(new Date()),
      });
    }

    // Save with master key as only the caption creator (and admins) can modify a caption object
    await caption.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  }
);

/**
 * Loads the list of latest captions
 */
Parse.Cloud.define(
  "loadLatestCaptions",
  async (): Promise<CaptionsResponse> => {
    const outputSubs = await getCaptions({
      limit: 10,
      offset: 0,
      getRejected: false,
      tags: [],
    });
    return <CaptionsResponse>{
      status: "success",
      captions: outputSubs.result,
    };
  }
);

/**
 * Loads the list of a languages translated to the given language
 * Will return captions from the base and sub languages
 */
Parse.Cloud.define(
  "loadLatestLanguageCaptions",
  async (
    request: Parse.Cloud.FunctionRequest<{ languageCode: string }>
  ): Promise<CaptionsResponse> => {
    const { languageCode } = request.params;

    // Normalize the language code
    const languageCodes = getRelatedLanguageCodes(languageCode);
    const outputSubs = await getCaptions({
      limit: 10,
      offset: 0,
      getRejected: false,
      languageCodes,
      tags: [],
    });

    return {
      status: "success",
      captions: outputSubs.result,
      hasMore: false,
    };
  }
);

/**
 * Loads popular captions based on likes vs dislike count
 *
 */
Parse.Cloud.define(
  "loadPopularCaptions",
  async (request: Parse.Cloud.FunctionRequest): Promise<CaptionsResponse> => {
    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);

    query.notEqualTo("rejected", true).greaterThan("likes", 0);
    query.limit(100).descending("likes");

    const captions = await query.find({ useMasterKey: true });
    const outputSubs: CaptionListFields[] = (
      await Promise.all(
        captions.map(async (sub) => {
          if (!canViewCaption(sub, request.user?.id)) {
            return undefined;
          }
          return await captionToListFields(sub);
        })
      )
    )
      .filter((sub) => {
        if (!sub) {
          return false;
        }
        return sub.likes > sub.dislikes;
      })
      .slice(0, 10);

    return {
      status: "success",
      captions: outputSubs,
      hasMore: false,
    };
  }
);

Parse.Cloud.define(
  "loadCaptionForReview",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>
  ): Promise<LoadCaptionForReviewResponse> => {
    const { captionId } = request.params;
    const caption = await loadCaption(captionId);
    if (!caption) {
      return undefined;
    }
    const { user } = request;

    const isAdmin = await hasAdminRole(user);
    const isReviewer = await hasReviewerRole(user);
    if (!isAdmin && !isReviewer) {
      return undefined;
    }

    const userProfile = await getUserProfile(caption.caption.get("creatorId"));
    const video = await loadVideo(
      caption.caption.get("videoId"),
      caption.caption.get("videoSource")
    );
    const videoName = video ? video.get("name") : "";
    return <LoadCaptionForReviewResponse>{
      status: "success",
      caption: caption.caption,
      captioner: userProfile,
      videoName,
    };
  }
);

/**
 * Make a user a reviewer, removes them as a reviewer if they are already one
 */
Parse.Cloud.define(
  "assignReviewerRole",
  async (
    request: Parse.Cloud.FunctionRequest<RoleRequest>
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { user: requester } = request;
    const isAdmin = await hasAdminRole(requester);
    const isReviewerManager = await hasReviewerManagerRole(requester);
    if (!isAdmin && !isReviewerManager) {
      return { status: "error", error: "Not authorized!" };
    }
    const { targetUserId } = request.params;
    const reviewerQuery = new Parse.Query(Parse.Role);
    reviewerQuery.equalTo("name", role.reviewer);
    const reviewerRole = await reviewerQuery.first({ useMasterKey: true });
    if (!reviewerRole) {
      return { status: "error", error: "Reviewer role not found!" };
    }

    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", targetUserId);
    const user = await userQuery.first({ useMasterKey: true });
    if (!user) {
      return { status: "error", error: "Target user not found!" };
    }
    const isReviewer = await hasReviewerRole(user);
    if (isReviewer) {
      reviewerRole.getUsers().remove(user);
    } else {
      reviewerRole.getUsers().add(user);
    }

    await reviewerRole.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  }
);

/**
 * Make a user a reviewer, removes them as a reviewer if they are already one
 */
Parse.Cloud.define(
  "assignReviewerManagerRole",
  async (
    request: Parse.Cloud.FunctionRequest<RoleRequest>
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { user: requester } = request;
    const isAdmin = await hasAdminRole(requester);
    if (!isAdmin) {
      return { status: "error", error: "Not authorized!" };
    }
    const { targetUserId } = request.params;
    const reviewerQuery = new Parse.Query(Parse.Role);
    reviewerQuery.equalTo("name", role.reviewerManager);
    const reviewerManagerRole = await reviewerQuery.first({
      useMasterKey: true,
    });
    if (!reviewerManagerRole) {
      return { status: "error", error: "Reviewer Manager role not found!" };
    }

    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", targetUserId);
    const user = await userQuery.first({ useMasterKey: true });
    if (!user) {
      return { status: "error", error: "Target user not found!" };
    }
    const isReviewerManager = await hasReviewerManagerRole(user);
    if (isReviewerManager) {
      reviewerManagerRole.getUsers().remove(user);
    } else {
      reviewerManagerRole.getUsers().add(user);
    }

    await reviewerManagerRole.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  }
);

/**
 * Search for captions
 */
Parse.Cloud.define(
  "search",
  async (
    request: Parse.Cloud.FunctionRequest<SearchRequest>
  ): Promise<VideoSearchResponse> => {
    const { title, limit, offset } = request.params;
    let { videoLanguageCode = "any", captionLanguageCode = "any" } =
      request.params;
    const searchRegex = new RegExp(escapeRegexInString(title), "i");
    // Find videos where the name contains the search string
    if (videoLanguageCode === languages.unk || !videoLanguageCode) {
      videoLanguageCode = "any";
    }
    if (captionLanguageCode === languages.unk || !captionLanguageCode) {
      captionLanguageCode = "any";
    }
    const videoQuery = getVideoByTitleQuery(
      searchRegex,
      captionLanguageCode,
      videoLanguageCode
    );

    const videosWithCaptionNames = await getVideoByCaptionTitleQuery(
      searchRegex,
      captionLanguageCode,
      videoLanguageCode
    );
    const videosWithVideoIdQuery = await getVideoByVideoIdQuery(
      searchRegex,
      captionLanguageCode,
      videoLanguageCode
    );

    const fullQuery = Parse.Query.or(
      ...[videoQuery, videosWithCaptionNames, videosWithVideoIdQuery].filter(
        Boolean
      )
    )
      .descending("updatedAt")
      .limit(limit + 1)
      .skip(offset);

    const videos = await fullQuery.find();

    return {
      status: "success",
      videos: videos.slice(0, limit),
      hasMoreResults: videos.length > limit,
    };
  }
);

Parse.Cloud.define(
  "verifyCaptioner",
  async (
    request: Parse.Cloud.FunctionRequest<VerifyRequest>
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { user: requester } = request;
    const isAdmin = await hasAdminRole(requester);
    if (!isAdmin) {
      return { status: "error", error: "Not authorized!" };
    }
    const { targetUserId } = request.params;
    const query = new Parse.Query<CaptionerSchema>(PARSE_CLASS.captioner);
    query.equalTo("userId", targetUserId);
    const captioner = await query.first();
    if (!captioner) {
      return { status: "error", error: "Target user not found!" };
    }
    captioner.set("verified", !captioner.get("verified"));
    await captioner.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  }
);

Parse.Cloud.define(
  "banCaptioner",
  async (
    request: Parse.Cloud.FunctionRequest<VerifyRequest>
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { user: requester } = request;
    const isAdmin = await hasAdminRole(requester);
    if (!isAdmin) {
      return { status: "error", error: "Not authorized!" };
    }
    const { targetUserId } = request.params;
    const query = new Parse.Query<CaptionerSchema>(PARSE_CLASS.captioner);
    query.equalTo("userId", targetUserId);
    const captioner = await query.first();
    if (!captioner) {
      return { status: "error", error: "Target user not found!" };
    }
    captioner.set("banned", !captioner.get("banned"));
    await captioner.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  }
);

/**
 * Browse captions
 * Only displays public captions
 */
Parse.Cloud.define(
  "browse",
  async (
    request: Parse.Cloud.FunctionRequest<BrowseRequest>
  ): Promise<BrowseResponse> => {
    const { limit, offset } = request.params;
    let { result: captions, hasMore } = await getCaptions({
      limit: limit,
      offset,
      getRejected: false,
      tags: [],
    });

    let count = undefined;
    if (captions.length <= 0 && offset > 0) {
      // Requested offset could be past the last page, try returning the last page
      count = await new Parse.Query(PARSE_CLASS.captions)
        .containedIn("privacy", [undefined, CaptionPrivacy.Public])
        .notEqualTo("rejected", true)
        .count({ useMasterKey: true });
      const overshotCaptionResult = await getCaptions({
        limit: limit,
        offset: count - (count % limit),
        getRejected: false,
        tags: [],
      });
      captions = overshotCaptionResult.result;
      hasMore = overshotCaptionResult.hasMore;
    } else {
      count = offset + captions.length;
    }
    return {
      status: "success",
      captions: captions.slice(0, limit),
      hasMoreResults: hasMore,
      totalCount: count,
    };
  }
);
