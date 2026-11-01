import { isAss } from "@/common/caption-utils";
import { captionTags } from "@/common/constants";
import {
  MAX_CAPTION_FILE_BYTES,
  MAX_VERIFIED_CAPTION_FILE_BYTES,
  MAX_VIDEO_TITLE_LENGTH,
} from "@/common/feature/caption-editor/constants";
import type { UpdateCaptionRequest } from "@/common/feature/video/types";
import type { CaptionSchema } from "@/common/providers/parse/types";
import type { UploadResponse } from "@/common/types";
import { decompressFromBase64 } from "lz-string";
import sanitizeFilename from "sanitize-filename";
import {
  ERROR_MESSAGES,
  MAX_CAPTION_GROUP_TAG_LIMIT,
  PARSE_CLASS,
} from "../constants";
import { addMissingCaptionTags } from "../users/add-missing-tags";
import { getUserProfile } from "../users/get-user-profile";
import { isUndefinedOrNull } from "../utils";
import { sanitizeTag } from "../utils/sanitize-tag";
import { validateAss } from "../validator";

Parse.Cloud.define(
  "updateCaption",
  async (
    request: Parse.Cloud.FunctionRequest<UpdateCaptionRequest>,
  ): Promise<UploadResponse> => {
    const { user } = request;
    if (!user || !user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    try {
      const updateProfile = await getUserProfile(user.id);
      if (!updateProfile) {
        return { status: "error", error: "Profile not found" };
      }
      const {
        banned,
        verified,
        captionTags: existingUserCaptionTags,
      } = updateProfile;
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
      const stringifiedCaption = JSON.stringify(newCaptionData || {});
      // We only want to store the raws of ass captions.
      // A raw caption without any storable data is treated as no raw caption at
      // all, otherwise the existing raw file would be dropped in exchange for an
      // empty file that the file router rejects with "Invalid file upload."
      const rawCaptionData =
        newRawCaption && isAss(newRawCaption.type) && newRawCaption.data
          ? newRawCaption.data
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
      // Check whether we need to delete any raw file if the caption was raw and is now not.
      const existingRawFile: Parse.File = existingCaption.get("rawFile");
      // If there's no raw caption after the update or the existing raw caption will be overwritten
      // delete the raw file
      if (
        (existingRawFile && newCaptionData && !rawCaptionData) ||
        (existingRawFile && rawCaptionData)
      ) {
        try {
          await existingRawFile.destroy();
        } catch (e) {
          console.warn(
            `[updateCaption] Failed to delete existing raw file for caption: ${captionId}`,
          );
        }
        existingCaption.set("rawFile", null);
        existingCaption.set("rawContent", null);
      }
      if (rawCaptionData) {
        existingCaption.set("content", JSON.stringify({ tracks: [] }));
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
          .filter(Boolean),
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

      if (rawCaptionData && newRawCaption && existingCaption.id) {
        // The data itself lives in the file, the meta only describes it
        const rawCaptionMeta = JSON.stringify({ ...newRawCaption, data: "" });
        // Save the raw caption's data to a file
        let rawFile: Parse.File = new Parse.File(
          sanitizeFilename(`${existingCaption.id}`),
          {
            // The raw data should already have been base64 compressed on the client's side
            base64: rawCaptionData,
          },
        );
        await rawFile.save({ sessionToken: user.getSessionToken() });
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
  },
);
