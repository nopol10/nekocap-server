import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { VIDEOS_COLLECTION } from "../constants";
import type { VideoDoc } from "../parse-compat/documents";
import { ParseConfigService } from "../parse-compat/parse-config.service";
import { ParseDbService } from "../parse-compat/parse-db.service";
import type { AutoCaptionListResponse } from "../shared/api-types";
import { VIDEO_LINK_GENERATORS, VideoSource } from "../shared/video-source";

const NOEMBED_URL = "https://www.noembed.com/embed";

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    @Inject(ParseDbService) private readonly db: ParseDbService,
    @Inject(ParseConfigService) private readonly config: ParseConfigService,
  ) {}

  collection() {
    return this.db.collection<VideoDoc>(VIDEOS_COLLECTION);
  }

  async findVideo(
    sourceId: string | undefined,
    source: string | undefined,
  ): Promise<VideoDoc | null> {
    if (sourceId === undefined || source === undefined) {
      return null;
    }
    return this.collection().findOne({ sourceId, source: String(source) });
  }

  async createVideo(fields: {
    sourceId: string;
    source: string;
    name: string;
    language: string;
    withCounts?: boolean;
  }): Promise<VideoDoc> {
    const { withCounts, ...videoFields } = fields;
    return this.db.create<VideoDoc>(VIDEOS_COLLECTION, {
      ...videoFields,
      ...(withCounts ? { captions: {}, captionCount: 0 } : {}),
    });
  }

  /**
   * Looks up a video's title through noembed. Returns an empty string when
   * the title can't be retrieved.
   */
  async getVideoName(videoSource: number, videoId: string): Promise<string> {
    const generateVideoLink = VIDEO_LINK_GENERATORS[videoSource];
    if (!generateVideoLink) {
      return "";
    }
    try {
      const response = await axios.get(NOEMBED_URL, {
        params: { url: generateVideoLink(videoId) },
        timeout: 10000,
      });
      return response.data?.title || "";
    } catch (e) {
      this.logger.warn(`Failed to retrieve OEmbed data: ${e}`);
      return "";
    }
  }

  async getAutoCaptionList(params: {
    videoId?: string;
    videoSource?: number | string;
  }): Promise<AutoCaptionListResponse> {
    if (Number(params.videoSource) !== VideoSource.Youtube) {
      return { captions: [], status: "error" };
    }
    // Auto captions were served through youtube-dl, which has been disabled
    // on the server, so there is never anything to return
    await this.config.allowAutoCaptioning();
    return { captions: [], status: "success" };
  }
}
