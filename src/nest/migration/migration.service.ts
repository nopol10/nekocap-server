import { Inject, Injectable, Logger } from "@nestjs/common";
import { captionTags } from "@/common/constants";
import { CaptionCountersService } from "../captions/caption-counters.service";
import {
  CAPTIONER_PRIVATE_COLLECTION,
  CAPTIONS_COLLECTION,
} from "../constants";
import { getPublicReadAdminReviewerACL } from "../parse-compat/acl";
import type {
  CaptionDoc,
  CaptionerPrivateDoc,
} from "../parse-compat/documents";
import { ParseConfigService } from "../parse-compat/parse-config.service";
import { ParseDbService } from "../parse-compat/parse-db.service";
import type { RequestContext } from "../shared/request-context";
import { VideoSource } from "../shared/video-source";
import { UsersService } from "../users/users.service";
import { VideosService } from "../videos/videos.service";

export type MigrationResponse = {
  status: "added" | "skipped" | "failed";
  name?: string;
};

type NameMap = { [videoId: string]: string };

const MIGRATED_TITLE = "Imported from YTExternalCC";

/**
 * One off data migration operations. These can only be run with the master
 * key while the server is in maintenance mode.
 */
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    @Inject(ParseDbService) private readonly db: ParseDbService,
    @Inject(ParseConfigService) private readonly config: ParseConfigService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(VideosService) private readonly videos: VideosService,
    @Inject(CaptionCountersService)
    private readonly counters: CaptionCountersService,
  ) {}

  private async canMigrate(ctx: RequestContext): Promise<boolean> {
    return !!ctx.master && (await this.config.isInMaintenanceMode());
  }

  async createVideo(
    {
      videoId,
      videoSource,
      nameMap = {},
    }: { videoId: string; videoSource: number; nameMap?: NameMap },
    ctx: RequestContext,
  ): Promise<MigrationResponse> {
    if (!(await this.canMigrate(ctx))) {
      return { status: "failed" };
    }
    const source = String(videoSource);
    if (await this.videos.findVideo(videoId, source)) {
      return { status: "skipped" };
    }
    const name =
      nameMap[videoId] ||
      (await this.videos.getVideoName(Number(videoSource), videoId));
    await this.videos.createVideo({
      language: "unk",
      sourceId: videoId,
      source,
      name,
      withCounts: true,
    });
    return { status: "added", name };
  }

  async createBatchYoutubeVideos(
    { videoIds = [], nameMap = {} }: { videoIds?: string[]; nameMap?: NameMap },
    ctx: RequestContext,
  ): Promise<MigrationResponse> {
    if (!(await this.canMigrate(ctx))) {
      return { status: "failed" };
    }
    const source = VideoSource.Youtube.toString();
    for (let i = 0; i < videoIds.length; i++) {
      if (i % 100 === 0) {
        this.logger.log(`Processed ${i}/${videoIds.length}`);
      }
      const videoId = videoIds[i];
      if (await this.videos.findVideo(videoId, source)) {
        continue;
      }
      await this.videos.createVideo({
        language: "unk",
        sourceId: videoId,
        source,
        name: nameMap[videoId] || "",
        withCounts: true,
      });
    }
    return { status: "added" };
  }

  async createCaptionerWithoutUser(
    { name, email }: { name: string; email: string },
    ctx: RequestContext,
  ): Promise<MigrationResponse> {
    if (!(await this.canMigrate(ctx))) {
      return { status: "failed" };
    }
    await this.users.createCaptionerWithoutUser(name, email);
    return { status: "added" };
  }

  async createCaption(
    {
      content,
      videoId,
      languageCode,
      email,
      userId,
    }: {
      content: string;
      videoId: string;
      languageCode: string;
      email?: string;
      userId?: string;
    },
    ctx: RequestContext,
  ): Promise<MigrationResponse> {
    if (!(await this.canMigrate(ctx))) {
      return { status: "failed" };
    }
    let captionerId = "";
    if (userId) {
      if (!(await this.users.findUser(userId))) {
        this.logger.log(`User ${userId} does not exist`);
        return { status: "failed" };
      }
      captionerId = userId;
    } else {
      const captionerPrivate = await this.db
        .collection<CaptionerPrivateDoc>(CAPTIONER_PRIVATE_COLLECTION)
        .findOne({ email });
      if (!captionerPrivate?.captionerId) {
        return { status: "failed" };
      }
      captionerId = captionerPrivate.captionerId;
    }
    const caption = await this.db.create<CaptionDoc>(
      CAPTIONS_COLLECTION,
      {
        creatorId: captionerId,
        language: languageCode,
        videoId,
        videoSource: VideoSource.Youtube.toString(),
        content,
        translatedTitle: MIGRATED_TITLE,
        tags: [captionTags.ytExCC],
      },
      getPublicReadAdminReviewerACL(),
    );
    await this.counters.onCaptionSaved(caption);
    return { status: "added" };
  }
}
