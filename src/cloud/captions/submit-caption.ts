import { isAss } from "@/common/caption-utils";
import { captionTags } from "@/common/constants";
import {
  MAX_CAPTION_FILE_BYTES,
  MAX_VERIFIED_CAPTION_FILE_BYTES,
  MAX_VIDEO_TITLE_LENGTH,
} from "@/common/feature/caption-editor/constants";
import type { SubmitCaptionRequest } from "@/common/feature/video/types";
import {
  CaptionPrivacy,
  WebSourceToVideoSourceMap,
} from "@/common/feature/video/types";
import type {
  CaptionSchema,
  VideoSchema,
} from "@/common/providers/parse/types";
import type { UploadResponse } from "@/common/types";
import { decompressFromBase64 } from "lz-string";
import sanitizeFilename from "sanitize-filename";
import { getPublicReadAdminReviewerACL } from "../acl";
import { isInMaintenanceMode } from "../config";
import {
  CAPTION_SUBMISSION_COOLDOWN,
  ERROR_MESSAGES,
  PARSE_CLASS,
} from "../constants";
import { getUserProfile } from "../users/get-user-profile";
import { getVideoName } from "../utils";
import { validateAss } from "../validator";

Parse.Cloud.define(
  "submitCaption",
  async (
    request: Parse.Cloud.FunctionRequest<SubmitCaptionRequest>,
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
      const profile = await getUserProfile(user.id);
      if (!profile) {
        return { status: "error", error: "Profile not found" };
      }
      const { banned, verified, lastSubmissionTime, name } = profile;
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
        !validateAss(decompressFromBase64(rawCaptionData) || "")
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
      const actualVideoSource =
        WebSourceToVideoSourceMap[caption.videoSource] ?? caption.videoSource;
      const source = actualVideoSource.toString();
      // Sanitize the input data a little just in case
      let {
        videoId,
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
        actualVideoSource === undefined
      ) {
        throw new Error("Missing information in submitted caption!");
      }
      videoId = videoId.substring(0, 256);
      const videoSourceString = source.substring(0, 6);
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
          "You already have 2 captions of the same language for this video!",
        );
      }

      // Create the corresponding video object for this element
      const videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
      videoQuery.equalTo("sourceId", videoId);
      videoQuery.equalTo("source", source);
      const videoResult = await videoQuery.first();
      if (!videoResult) {
        videoName =
          (await getVideoName(caption.videoSource, videoId)) ||
          videoName.substring(0, 100);
        const Video = Parse.Object.extend(
          PARSE_CLASS.videos,
        ) as new () => VideoSchema;
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

      const Caption = Parse.Object.extend(
        PARSE_CLASS.captions,
      ) as new () => CaptionSchema;
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
      // Only captions with storable raw data get a raw file.
      // Uploading an empty file is rejected by the file router ("Invalid file
      // upload."), which used to fail submissions that carried a raw caption
      // object without any ass data
      if (rawCaptionData && rawCaption && newCaption.id) {
        // The data itself lives in the file, the meta only describes it
        const rawCaptionMeta = JSON.stringify({ ...rawCaption, data: "" });
        // Save the raw caption's data to a file
        const filename = sanitizeFilename(`${newCaption.id}`);
        console.log("filename", filename);
        let rawFile: Parse.File = new Parse.File(filename, {
          // The raw data should already have been base64 compressed on the client's side
          base64: rawCaptionData,
        });
        await rawFile.save({ sessionToken: user.getSessionToken() });
        newCaption.set("rawContent", rawCaptionMeta);
        newCaption.set("rawFile", rawFile);
        await newCaption.save(null, { useMasterKey: true });
      }
    } catch (e) {
      // The caption is saved before its raw file, so a failure past that point
      // would otherwise leave the user with a caption they were told failed.
      // A raw caption without its raw file is unusable, so remove it
      if (newCaptionId) {
        try {
          const createdCaption = new Parse.Object(PARSE_CLASS.captions);
          createdCaption.id = newCaptionId;
          await createdCaption.destroy({ useMasterKey: true });
        } catch (destroyError) {
          console.error(
            "[submitCaption] Failed to remove caption after a failed submission:",
            newCaptionId,
            destroyError,
          );
        }
        newCaptionId = undefined;
      }
      return { status: "error", error: e.message };
    }
    return { status: "success", captionId: newCaptionId };
  },
);
