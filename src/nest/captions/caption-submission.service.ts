import { Inject, Injectable, Logger } from "@nestjs/common";
import { isAss } from "@/common/caption-utils";
import { captionTags } from "@/common/constants";
import {
  MAX_CAPTION_FILE_BYTES,
  MAX_VERIFIED_CAPTION_FILE_BYTES,
  MAX_VIDEO_TITLE_LENGTH,
} from "@/common/feature/caption-editor/constants";
import { decompressFromBase64 } from "lz-string";
import sanitizeFilename from "sanitize-filename";
import {
  CAPTION_SUBMISSION_COOLDOWN,
  CAPTIONS_COLLECTION,
  ERROR_MESSAGES,
  MAX_CAPTION_GROUP_TAG_LIMIT,
  ROLES,
} from "../constants";
import { getPublicReadAdminReviewerACL } from "../parse-compat/acl";
import type { CaptionDoc } from "../parse-compat/documents";
import { FilesService } from "../parse-compat/files.service";
import { ParseConfigService } from "../parse-compat/parse-config.service";
import { ParseDbService } from "../parse-compat/parse-db.service";
import { RolesService } from "../parse-compat/roles.service";
import { validateAss } from "../shared/ass-validator";
import type {
  RawCaptionData,
  ServerResponse,
  SubmitCaptionRequest,
  UpdateCaptionRequest,
  UploadResponse,
} from "../shared/api-types";
import { sanitizeTag } from "../shared/caption-tags";
import type { RequestContext } from "../shared/request-context";
import { isTruthy, isUndefinedOrNull } from "../shared/utils";
import {
  CaptionPrivacy,
  WebSourceToVideoSourceMap,
} from "../shared/video-source";
import { UsersService } from "../users/users.service";
import { VideosService } from "../videos/videos.service";
import { CaptionCountersService } from "./caption-counters.service";
import { CaptionsService } from "./captions.service";

/** Thrown to return an error message to the user */
class SubmissionError extends Error {}

/**
 * We only want to store the raws of ass captions.
 * A raw caption without any storable data is treated as no raw caption at all
 */
const getStorableRawData = (rawCaption?: RawCaptionData | null): string =>
  rawCaption && isAss(rawCaption.type) && rawCaption.data
    ? rawCaption.data
    : "";

const isInvalidAss = (rawCaptionData: string, verified?: boolean) =>
  !!rawCaptionData &&
  // Skip validation of ass files for verified users.
  // Some complex files can have invalid data but still work
  !verified &&
  !validateAss(decompressFromBase64(rawCaptionData) || "");

const assertWithinSizeLimit = (
  captionData: string,
  rawCaptionData: string,
  verified?: boolean,
) => {
  const allowedFileSize = verified
    ? MAX_VERIFIED_CAPTION_FILE_BYTES
    : MAX_CAPTION_FILE_BYTES;
  if (
    Buffer.byteLength(captionData) > allowedFileSize ||
    Buffer.byteLength(JSON.stringify(rawCaptionData)) > allowedFileSize
  ) {
    throw new SubmissionError("Captions exceed size limit!");
  }
};

@Injectable()
export class CaptionSubmissionService {
  private readonly logger = new Logger(CaptionSubmissionService.name);

  constructor(
    @Inject(ParseDbService) private readonly db: ParseDbService,
    @Inject(ParseConfigService) private readonly config: ParseConfigService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(VideosService) private readonly videos: VideosService,
    @Inject(CaptionsService) private readonly captions: CaptionsService,
    @Inject(CaptionCountersService)
    private readonly counters: CaptionCountersService,
  ) {}

  /**
   * Saves the raw caption's (lz-string compressed, base64 encoded) data to a
   * file and links it to the caption
   */
  private async attachRawFile(
    caption: CaptionDoc,
    rawCaption: RawCaptionData,
    rawCaptionData: string,
  ): Promise<void> {
    const rawFile = await this.files.createFromBase64(
      sanitizeFilename(caption._id),
      rawCaptionData,
    );
    // The data itself lives in the file, the meta only describes it
    const rawContent = JSON.stringify({ ...rawCaption, data: "" });
    await this.db.updateById<CaptionDoc>(CAPTIONS_COLLECTION, caption._id, {
      $set: { rawContent, rawFile },
    });
  }

  async submitCaption(
    request: SubmitCaptionRequest,
    ctx: RequestContext,
  ): Promise<UploadResponse> {
    const { user } = ctx;
    if (!user) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await this.config.isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    let newCaption: CaptionDoc | undefined;
    try {
      const profile = await this.users.getUserProfile(user.id);
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
      } = request;
      if (!caption || !video) {
        throw new SubmissionError("Missing information in submitted caption!");
      }
      const stringifiedCaption = JSON.stringify(caption.data);
      const rawCaptionData = getStorableRawData(rawCaption);
      if (isInvalidAss(rawCaptionData, verified)) {
        return { status: "error", error: "Invalid .ass/.ssa file" };
      }
      assertWithinSizeLimit(stringifiedCaption, rawCaptionData, verified);

      const actualVideoSource =
        WebSourceToVideoSourceMap[
          caption.videoSource as keyof typeof WebSourceToVideoSourceMap
        ] ?? caption.videoSource;
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
        actualVideoSource === undefined ||
        actualVideoSource === null
      ) {
        throw new SubmissionError("Missing information in submitted caption!");
      }
      // Sanitize the input data a little just in case
      const source = actualVideoSource.toString();
      videoId = String(videoId).substring(0, 256);
      const videoSourceString = source.substring(0, 6);
      captionLanguageCode = String(captionLanguageCode).substring(0, 20);
      translatedTitle = String(translatedTitle).substring(
        0,
        MAX_VIDEO_TITLE_LENGTH,
      );
      videoLanguageCode = String(videoLanguageCode || "").substring(0, 20);

      // A user cannot have more than 2 captions of the same language for each video
      const existingCount = await this.captions.collection().countDocuments({
        videoId,
        videoSource: source,
        creatorId: user.id,
        language: captionLanguageCode,
      });
      if (existingCount >= 2) {
        throw new SubmissionError(
          "You already have 2 captions of the same language for this video!",
        );
      }

      // Create the corresponding video object for this caption
      if (!(await this.videos.findVideo(videoId, source))) {
        videoName =
          (await this.videos.getVideoName(caption.videoSource, videoId)) ||
          String(videoName || "").substring(0, 100);
        await this.videos.createVideo({
          language: videoLanguageCode,
          sourceId: videoId,
          source: videoSourceString,
          name: videoName,
        });
      }

      const tags: string[] = [];
      if (hasAudioDescription) {
        tags.push(captionTags.audioDescribed);
      }
      newCaption = await this.db.create<CaptionDoc>(
        CAPTIONS_COLLECTION,
        {
          creatorId: user.id,
          language: captionLanguageCode,
          videoId,
          videoSource: videoSourceString,
          content: stringifiedCaption,
          translatedTitle,
          tags,
          privacy,
        },
        getPublicReadAdminReviewerACL(),
      );
      await this.counters.onCaptionSaved(newCaption);
      this.logger.log(`New caption id by ${user.id}: ${newCaption._id}`);

      // Only captions with storable raw data get a raw file
      if (rawCaptionData && rawCaption) {
        await this.attachRawFile(newCaption, rawCaption, rawCaptionData);
      }
      return { status: "success", captionId: newCaption._id };
    } catch (e) {
      // The caption is saved before its raw file, so a failure past that
      // point would otherwise leave the user with a caption they were told
      // failed. A raw caption without its raw file is unusable, so remove it
      if (newCaption) {
        try {
          await this.removeCaption(newCaption);
        } catch (removeError) {
          this.logger.error(
            `Failed to remove caption after a failed submission: ${newCaption._id}`,
            removeError,
          );
        }
      }
      if (!(e instanceof SubmissionError)) {
        this.logger.error("[submitCaption]", e);
      }
      return { status: "error", error: (e as Error).message };
    }
  }

  async updateCaption(
    request: UpdateCaptionRequest,
    ctx: RequestContext,
  ): Promise<UploadResponse> {
    const { user } = ctx;
    if (!user) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    try {
      const profile = await this.users.getUserProfile(user.id);
      if (!profile) {
        return { status: "error", error: "Profile not found" };
      }
      const {
        banned,
        verified,
        captionTags: existingUserCaptionTags,
      } = profile;
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
      } = request;
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
        return { status: "error", error: "Nothing to update" };
      }
      if (newRawCaption && newCaptionData) {
        return { status: "error", error: "Too many caption types supplied" };
      }
      const existingCaption = await this.captions
        .collection()
        .findOne({ _id: String(captionId), creatorId: user.id });
      if (!existingCaption) {
        return { status: "error", error: "No such caption" };
      }
      const previousPrivacy = existingCaption.privacy;
      const stringifiedCaption = JSON.stringify(newCaptionData || {});
      // A raw caption without storable data is treated as no raw caption at
      // all, otherwise the existing raw file would be dropped
      const rawCaptionData = getStorableRawData(newRawCaption);
      if (isInvalidAss(rawCaptionData, verified)) {
        return { status: "error", error: "Invalid .ass/.ssa file" };
      }
      const updates: Partial<CaptionDoc> = {};
      // If there's no raw caption after the update or the existing raw
      // caption will be overwritten, delete the raw file
      const existingRawFile = existingCaption.rawFile;
      if (
        (existingRawFile && newCaptionData && !rawCaptionData) ||
        (existingRawFile && rawCaptionData)
      ) {
        try {
          await this.files.delete(existingRawFile);
        } catch (e) {
          this.logger.warn(
            `[updateCaption] Failed to delete existing raw file for caption: ${captionId}`,
          );
        }
        updates.rawFile = null;
        updates.rawContent = null;
      }
      if (rawCaptionData) {
        updates.content = JSON.stringify({ tracks: [] });
      }
      assertWithinSizeLimit(stringifiedCaption, rawCaptionData, verified);

      updates.translatedTitle = newTranslatedTitle
        ? String(newTranslatedTitle).substring(0, MAX_VIDEO_TITLE_LENGTH)
        : existingCaption.translatedTitle;

      const tags: string[] = [];
      if (
        !isUndefinedOrNull(newHasAudioDescription) &&
        newHasAudioDescription
      ) {
        tags.push(captionTags.audioDescribed);
      }
      tags.push(
        ...(Array.isArray(selectedTags) ? selectedTags : [])
          .slice(0, MAX_CAPTION_GROUP_TAG_LIMIT)
          .map((newTag) => sanitizeTag(String(newTag), existingUserCaptionTags))
          .filter(isTruthy),
      );
      updates.tags = tags;
      await this.users.addMissingCaptionTags(user.id, tags);

      if (!isUndefinedOrNull(newPrivacy)) {
        updates.privacy = newPrivacy;
      }
      if (newCaptionData) {
        updates.content = stringifiedCaption;
      }
      await this.db.updateById<CaptionDoc>(
        CAPTIONS_COLLECTION,
        existingCaption._id,
        { $set: updates },
      );
      await this.counters.onCaptionSaved(
        { ...existingCaption, ...updates },
        previousPrivacy,
      );

      if (rawCaptionData && newRawCaption) {
        await this.attachRawFile(
          existingCaption,
          newRawCaption,
          rawCaptionData,
        );
      }
      this.logger.log(`Updated caption id by ${user.id}: ${captionId}`);
    } catch (e) {
      if (!(e instanceof SubmissionError)) {
        this.logger.error("[updateCaption]", e);
      }
      return { status: "error", error: (e as Error).message };
    }
    return { status: "success" };
  }

  async deleteCaption(
    captionId: string,
    ctx: RequestContext,
  ): Promise<ServerResponse> {
    const { user } = ctx;
    if (!user) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await this.config.isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const caption = await this.captions.findById(captionId);
    if (!caption) {
      return { status: "error", error: "Unknown caption" };
    }
    // Captions can be deleted by their creator, admins and (through the
    // caption's ACL) reviewers
    const canDelete =
      caption.creatorId === user.id ||
      (await this.roles.hasAdminRole(user.id)) ||
      (await this.roles.hasRole(user.id, ROLES.reviewer));
    if (!canDelete) {
      return { status: "error", error: "Not authorized!" };
    }
    await this.removeCaption(caption);
    return { status: "success" };
  }

  /**
   * Deletes a caption along with its raw file and updates the counts
   */
  private async removeCaption(caption: CaptionDoc): Promise<void> {
    // Re-read the caption as a raw file may have been attached since
    const current = (await this.captions.findById(caption._id)) || caption;
    await this.captions.collection().deleteOne({ _id: current._id });
    await this.counters.onCaptionDeleted(current);
    if (current.rawFile) {
      await this.files.delete(current.rawFile);
    }
  }
}
