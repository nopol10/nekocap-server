import { Inject, Injectable } from "@nestjs/common";
import { CAPTIONER_COLLECTION, VIDEOS_COLLECTION } from "../constants";
import type {
  CaptionDoc,
  CaptionerDoc,
  VideoDoc,
} from "../parse-compat/documents";
import { ParseDbService } from "../parse-compat/parse-db.service";
import { CaptionPrivacy } from "../shared/video-source";

/**
 * Keeps the denormalised caption counts on videos and captioners up to date.
 * These used to be maintained by the Parse `captions` afterSave / afterDelete
 * hooks. Since captions are no longer saved through Parse, every write to a
 * caption must go through here instead.
 */
@Injectable()
export class CaptionCountersService {
  constructor(@Inject(ParseDbService) private readonly db: ParseDbService) {}

  /**
   * Call after a caption has been created or modified.
   * @param caption the caption after the change
   * @param previousPrivacy the caption's privacy before the change, or
   * undefined when the caption has just been created
   */
  async onCaptionSaved(
    caption: CaptionDoc,
    previousPrivacy?: number | null,
  ): Promise<void> {
    const isNew = previousPrivacy === undefined;
    const newPrivacy = caption.privacy || CaptionPrivacy.Public;
    let captionCountChange = 1;
    if (!isNew) {
      const originalPrivacy = previousPrivacy || CaptionPrivacy.Public;
      if (
        originalPrivacy === CaptionPrivacy.Public &&
        newPrivacy !== CaptionPrivacy.Public
      ) {
        captionCountChange = -1;
      } else if (originalPrivacy === newPrivacy) {
        captionCountChange = 0;
      }
      // Anything → public is a +1, the same as adding a new caption
    } else if (newPrivacy !== CaptionPrivacy.Public) {
      captionCountChange = 0;
    }
    // Every caption save touches the video (bumping its updatedAt), which
    // search results are sorted by
    await this.updateVideoCounts(caption, captionCountChange, false);

    if (isNew && caption.creatorId) {
      await this.db.collection<CaptionerDoc>(CAPTIONER_COLLECTION).updateOne(
        { userId: caption.creatorId },
        this.db.withUpdatedAt<CaptionerDoc>({
          $set: { lastSubmissionTime: Date.now() },
          $inc: { captionCount: 1 },
        }),
      );
    }
  }

  /**
   * Call after a caption has been deleted
   */
  async onCaptionDeleted(caption: CaptionDoc): Promise<void> {
    if (caption.creatorId) {
      await this.db
        .collection<CaptionerDoc>(CAPTIONER_COLLECTION)
        .updateOne(
          { userId: caption.creatorId },
          this.db.withUpdatedAt<CaptionerDoc>({ $inc: { captionCount: -1 } }),
        );
    }
    // Only public captions are counted on videos
    const wasCounted =
      (caption.privacy || CaptionPrivacy.Public) === CaptionPrivacy.Public;
    await this.updateVideoCounts(caption, wasCounted ? -1 : 0, true);
  }

  private async updateVideoCounts(
    caption: CaptionDoc,
    change: number,
    removeEmptyLanguage: boolean,
  ): Promise<void> {
    const videos = this.db.collection<VideoDoc>(VIDEOS_COLLECTION);
    const video = await videos.findOne({
      sourceId: caption.videoId,
      source: caption.videoSource,
    });
    if (!video) {
      return;
    }
    const language = caption.language || "";
    const captions = { ...(video.captions || {}) };
    const languageCount = Math.max(0, (captions[language] || 0) + change);
    captions[language] = languageCount;
    if (removeEmptyLanguage && languageCount <= 0) {
      delete captions[language];
    }
    await videos.updateOne(
      { _id: video._id },
      this.db.withUpdatedAt<VideoDoc>({
        $set: { captions },
        ...(change !== 0 ? { $inc: { captionCount: change } } : {}),
      }),
    );
  }
}
