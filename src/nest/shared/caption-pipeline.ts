import type { PipelineStage } from "mongoose";
import {
  MAX_CAPTION_TITLE_FILTER_LENGTH,
  MAX_SEARCH_TAG_LIMIT,
} from "../constants";
import type {
  CaptionDoc,
  CaptionerDoc,
  VideoDoc,
} from "../parse-compat/documents";
import type { AdvancedFilter, CaptionListFields } from "./api-types";
import { getCaptionGroupTagName } from "./caption-tags";
import { CaptionPrivacy } from "./video-source";
import { escapeRegexInString, unixSeconds } from "./utils";

/**
 * Joins the video a caption belongs to onto the caption as `video`.
 * Split out from CAPTION_DETAILS_JOIN_PIPELINE so that queries which need to
 * filter on video fields (e.g. the video title) can perform this join earlier
 * in the pipeline without paying for the captioner join as well.
 */
export const VIDEO_JOIN_PIPELINE: PipelineStage[] = [
  {
    $lookup: {
      from: "videos",
      as: "video",
      // Using the nested pipeline to prevent duplicate videos from returning
      // multiple copies of the same caption
      let: { localField: "$videoId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$sourceId", "$$localField"] } } },
        { $limit: 1 },
      ],
    },
  },
  { $unwind: { path: "$video", preserveNullAndEmptyArrays: true } },
];

/**
 * Joins the captioner who created a caption onto the caption as `captioner`.
 */
export const CAPTIONER_JOIN_PIPELINE: PipelineStage[] = [
  {
    $lookup: {
      from: "captioner",
      as: "captioner",
      let: { localField: "$creatorId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$userId", "$$localField"] } } },
        { $limit: 1 },
      ],
    },
  },
  { $unwind: { path: "$captioner", preserveNullAndEmptyArrays: true } },
];

export const CAPTION_DETAILS_JOIN_PIPELINE: PipelineStage[] = [
  ...VIDEO_JOIN_PIPELINE,
  ...CAPTIONER_JOIN_PIPELINE,
];

export type JoinedCaptionDoc = CaptionDoc & {
  video?: VideoDoc;
  captioner?: CaptionerDoc;
};

export type CaptionQueryParams = {
  limit: number;
  offset: number;
  captionerId?: string;
  /** The user viewing the captions */
  userId?: string;
  getRejected: boolean;
  languageCodes?: string[];
  tags?: string[];
  advancedFilter?: AdvancedFilter;
  /**
   * Keeps only captions whose original video title or translated title
   * contains this string (case insensitive).
   */
  titleFilter?: string;
};

/**
 * Trims the caller provided title filter and caps its length so that a huge
 * string can't be turned into an expensive regex.
 */
const normalizeTitleFilter = (titleFilter?: string): string =>
  (titleFilter || "").trim().slice(0, MAX_CAPTION_TITLE_FILTER_LENGTH);

/**
 * Builds the aggregation stages used to list captions.
 * A negative limit returns every matching caption.
 */
export const buildCaptionQueryStages = ({
  limit = 10,
  offset = 0,
  captionerId,
  userId,
  getRejected = true,
  languageCodes,
  tags = [],
  advancedFilter = "all",
  titleFilter,
}: CaptionQueryParams): PipelineStage[] => {
  const filters: Record<string, unknown> = {};
  if (captionerId) {
    filters.creatorId = captionerId;
  }
  // Only the captioner can see their own non public captions
  if (captionerId !== userId || !userId) {
    filters.privacy = { $in: [null, CaptionPrivacy.Public] };
  }
  if (!getRejected) {
    filters.rejected = { $ne: true };
  }
  if (languageCodes) {
    filters.language = { $in: languageCodes };
  }
  if (tags.length > 0) {
    const tagRegex = tags
      .slice(0, MAX_SEARCH_TAG_LIMIT)
      .map((tag) => `^g:${getCaptionGroupTagName(tag)}:.*$`)
      .join("|");
    filters.tags = { $regex: tagRegex };
  }
  const matchStage: Record<string, unknown> =
    advancedFilter === "advanced"
      ? { ...filters, rawContent: { $exists: true, $nin: [null, ""] } }
      : advancedFilter === "nonAdvanced"
        ? {
            $and: [
              filters,
              {
                $or: [
                  { rawContent: { $exists: false } },
                  { rawContent: { $in: [null, ""] } },
                ],
              },
            ],
          }
        : filters;
  const normalizedTitleFilter = normalizeTitleFilter(titleFilter);
  const stages: PipelineStage[] = [
    { $match: matchStage },
    { $sort: { _created_at: -1 } },
  ];
  if (normalizedTitleFilter) {
    // The original title lives on the video document, so the video join has
    // to happen before captions can be matched on it. The $match above has
    // already narrowed the pipeline down and the join itself is served by the
    // videos.sourceId index.
    const titleRegex = {
      $regex: escapeRegexInString(normalizedTitleFilter),
      $options: "i",
    };
    stages.push(...VIDEO_JOIN_PIPELINE, {
      $match: {
        $or: [{ translatedTitle: titleRegex }, { "video.name": titleRegex }],
      },
    });
  }
  stages.push({ $skip: offset });
  if (limit >= 0) {
    stages.push({ $limit: limit + 1 });
  }
  // The video has already been joined on above when filtering by title
  stages.push(
    ...(normalizedTitleFilter
      ? CAPTIONER_JOIN_PIPELINE
      : CAPTION_DETAILS_JOIN_PIPELINE),
  );
  return stages;
};

/**
 * Converts a caption document with its video and captioner joined on into the
 * list item shape used by the frontend
 */
export const toCaptionListFields = (
  caption: JoinedCaptionDoc,
): CaptionListFields => {
  const createdAt = caption._created_at
    ? new Date(caption._created_at)
    : new Date();
  const updatedAt = caption._updated_at
    ? new Date(caption._updated_at)
    : new Date();
  return {
    id: String(caption._id),
    language: caption.language,
    videoId: caption.videoId,
    videoSource: caption.videoSource,
    data: "",
    creatorId: caption.creatorId,
    creatorName: caption.captioner?.name || "",
    videoName: caption.video?.name || "",
    videoLanguage: caption.video?.language || "",
    views: caption.views || 0,
    translatedTitle: caption.translatedTitle || undefined,
    likes: caption.likes || 0,
    dislikes: caption.dislikes || 0,
    verified: caption.verified || false,
    rejected: caption.rejected || undefined,
    createdDate: unixSeconds(createdAt),
    updatedDate: unixSeconds(updatedAt),
    tags: caption.tags || [],
    privacy: caption.privacy || 0,
    advanced: !!caption.rawContent,
  };
};
