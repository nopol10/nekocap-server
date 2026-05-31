import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, PipelineStage } from "mongoose";
import { Caption } from "../shared/schemas/caption.schema";
import { Video, VideoCaptionData } from "../shared/schemas/video.schema";

// Mirrors VideoFields in nekocap's src/common/feature/video/types.ts (the shape
// the frontend's VideoSearchResults expects for each result).
export type VideoSearchResultFields = {
  name: string;
  language: string;
  source: string;
  sourceId: string;
  sourceCreatorId: string;
  captions: VideoCaptionData;
  captionCount: number;
};

export type VideoSearchResponsePayload = {
  status: "success" | "error";
  videos: VideoSearchResultFields[];
  hasMoreResults: boolean;
};

export type SearchParams = {
  title: string;
  videoLanguageCode?: string;
  captionLanguageCode?: string;
  limit?: number;
  offset?: number;
};

type AggregatedVideo = {
  name?: string;
  language?: string;
  source?: string | number;
  sourceId?: string;
  sourceCreatorId?: string;
  captions?: VideoCaptionData;
  captionCount?: number;
};

type CaptionVideoRef = {
  videoId?: string;
  videoSource?: string;
};

const ANY = "any";
const PUBLIC_PRIVACY = 0;

// Mirrors escapeRegexInString in src/cloud/utils.ts.
const escapeRegexInString = (input: string): string =>
  input.replace(/[#-.]|[[-^]|[?|{}]/g, "\\$&");

// Normalises a language code the way the Parse `search` cloud function does:
// empty / unknown codes are treated as "any" (no filtering).
const normalizeLanguageCode = (code?: string): string => {
  if (!code || code === "unk" || code === "Unknown") {
    return ANY;
  }
  return code;
};

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Caption.name)
    private readonly captionModel: Model<Caption>,
    @InjectModel(Video.name)
    private readonly videoModel: Model<Video>,
  ) {}

  async search(params: SearchParams): Promise<VideoSearchResponsePayload> {
    const { title, limit = 0, offset = 0 } = params;
    const videoLanguageCode = normalizeLanguageCode(params.videoLanguageCode);
    const captionLanguageCode = normalizeLanguageCode(
      params.captionLanguageCode,
    );
    const escapedTitle = escapeRegexInString(title);
    const titleRegex = { $regex: escapedTitle, $options: "i" };

    // Strategy 3 (caption translated title): find captions whose
    // translatedTitle matches, then include the videos they belong to.
    const captionVideoRefs = await this.findVideosByCaptionTitle(
      escapedTitle,
      captionLanguageCode,
    );

    const captionLanguageMatch =
      this.captionLanguageMatch(captionLanguageCode);
    const nameStrategy: Record<string, unknown> = {
      name: titleRegex,
      captionCount: { $gt: 0 },
      ...captionLanguageMatch,
    };
    const sourceIdStrategy: Record<string, unknown> = {
      sourceId: titleRegex,
      captionCount: { $gt: 0 },
      ...captionLanguageMatch,
    };
    const strategies: Record<string, unknown>[] = [
      nameStrategy,
      sourceIdStrategy,
    ];
    if (captionVideoRefs.length > 0) {
      strategies.push({
        $or: captionVideoRefs.map((ref) => ({
          sourceId: ref.videoId,
          source: ref.videoSource,
        })),
      });
    }

    const and: Record<string, unknown>[] = [{ $or: strategies }];
    const videoLanguageMatch = this.videoLanguageMatch(videoLanguageCode);
    if (videoLanguageMatch) {
      and.push(videoLanguageMatch);
    }

    const stages: PipelineStage[] = [
      { $match: { $and: and } },
      { $sort: { _updated_at: -1 } },
      { $skip: offset },
      { $limit: limit + 1 },
    ];
    const docs = await this.videoModel
      .aggregate<AggregatedVideo>(stages)
      .exec();

    return {
      status: "success",
      videos: docs.slice(0, limit).map((doc) => this.toFields(doc)),
      hasMoreResults: docs.length > limit,
    };
  }

  private async findVideosByCaptionTitle(
    escapedTitle: string,
    captionLanguageCode: string,
  ): Promise<CaptionVideoRef[]> {
    const filter: Record<string, unknown> = {
      translatedTitle: { $regex: escapedTitle, $options: "i" },
      privacy: { $in: [null, PUBLIC_PRIVACY] },
    };
    if (captionLanguageCode !== ANY) {
      filter.language = {
        $regex: `^${escapeRegexInString(captionLanguageCode)}($|_+.*)`,
        $options: "i",
      };
    }
    const captions = await this.captionModel
      .find(filter, { videoId: 1, videoSource: 1 })
      .lean()
      .exec();

    const seen = new Set<string>();
    const refs: CaptionVideoRef[] = [];
    for (const caption of captions as CaptionVideoRef[]) {
      const key = `${caption.videoId}::${caption.videoSource}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      refs.push({
        videoId: caption.videoId,
        videoSource: caption.videoSource,
      });
    }
    return refs;
  }

  // Restricts videos to those with at least one caption in the requested
  // caption language. A base code (e.g. "en") expands to all of its
  // sub-languages (e.g. "en_US"); a specific sub-code matches exactly.
  private captionLanguageMatch(
    captionLanguageCode: string,
  ): Record<string, unknown> {
    if (captionLanguageCode === ANY) {
      return {};
    }
    if (captionLanguageCode.includes("_")) {
      return { [`captions.${captionLanguageCode}`]: { $gt: 0 } };
    }
    const keyRegex = `^${escapeRegexInString(captionLanguageCode)}($|_)`;
    return {
      $expr: {
        $gt: [
          {
            $size: {
              $filter: {
                input: { $objectToArray: { $ifNull: ["$captions", {}] } },
                as: "caption",
                cond: {
                  $and: [
                    { $gt: ["$$caption.v", 0] },
                    {
                      $regexMatch: {
                        input: "$$caption.k",
                        regex: keyRegex,
                        options: "i",
                      },
                    },
                  ],
                },
              },
            },
          },
          0,
        ],
      },
    };
  }

  private videoLanguageMatch(
    videoLanguageCode: string,
  ): Record<string, unknown> | null {
    if (videoLanguageCode === ANY) {
      return null;
    }
    if (videoLanguageCode.includes("_")) {
      return { language: videoLanguageCode };
    }
    return {
      language: {
        $regex: `^${escapeRegexInString(videoLanguageCode)}($|_+.*)`,
        $options: "i",
      },
    };
  }

  private toFields(doc: AggregatedVideo): VideoSearchResultFields {
    return {
      name: doc.name || "",
      language: doc.language || "",
      source: doc.source != null ? String(doc.source) : "",
      sourceId: doc.sourceId || "",
      sourceCreatorId: doc.sourceCreatorId || "",
      captions: doc.captions || {},
      captionCount: doc.captionCount || 0,
    };
  }
}
