import {
  CaptionListFields,
  CaptionPrivacy,
} from "@/common/feature/video/types";
import { getCaptionGroupTagName } from "@/common/feature/video/utils";
import { CaptionSchema } from "@/common/providers/parse/types";
import { MAX_CAPTION_TITLE_FILTER_LENGTH, PARSE_CLASS } from "cloud/constants";
import { escapeRegexInString } from "cloud/utils";
import {
  CAPTION_DETAILS_JOIN_PIPELINE,
  CAPTIONER_JOIN_PIPELINE,
  VIDEO_JOIN_PIPELINE,
} from "./caption-details-join-pipeline";
import { captionWithJoinedDataToListFields } from "./caption-to-list-field";

const MAX_SEARCH_TAG_LIMIT = 5;

export type AdvancedFilter = "all" | "advanced" | "nonAdvanced";

type MongoOperator<T> = {
  $in?: T[];
  $nin?: T[];
  $ne?: T;
  $eq?: T;
  $exists?: boolean;
  $regex?: string;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
};

/** Equality match against `T`, or a Mongo operator expression over `T`. */
type MongoFilter<T> = T | MongoOperator<T>;

type GetCaptionBaseParam = {
  limit: number;
  offset: number;
  captionerId?: string;
  userId?: string;
  getRejected: boolean;
  languageCodes?: string[];
  tags: string[];
  advancedFilter?: AdvancedFilter;
  /**
   * Keeps only captions whose original video title or translated title contains
   * this string (case insensitive).
   */
  titleFilter?: string;
};

type GetCaptionsWithCountOnly = (param: GetCaptionBaseParam) => Promise<number>;

type GetCaptionsWithDetails = (
  param: GetCaptionBaseParam,
) => Promise<{ result: CaptionListFields[]; hasMore: boolean }>;

/**
 * Trims the caller provided title filter and caps its length so that a huge
 * string can't be turned into an expensive regex.
 */
const normalizeTitleFilter = (titleFilter?: string): string => {
  return (titleFilter || "").trim().slice(0, MAX_CAPTION_TITLE_FILTER_LENGTH);
};

/**
 * Builds the aggregation stages used to list captions.
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
}: GetCaptionBaseParam): Record<string, any>[] => {
  const filters: {
    creatorId?: string;
    privacy?: MongoFilter<CaptionPrivacy | undefined>;
    rejected?: MongoFilter<boolean>;
    language?: MongoFilter<string>;
    tags?: MongoFilter<string>;
  } = {};
  if (!!captionerId) {
    filters.creatorId = captionerId;
  }
  if (captionerId !== userId || !userId) {
    filters.privacy = {
      $in: [undefined, CaptionPrivacy.Public],
    };
  }
  if (!getRejected) {
    filters.rejected = { $ne: true };
  }
  if (!!languageCodes) {
    filters.language = {
      $in: languageCodes,
    };
  }
  if (tags.length > 0) {
    const tagRegex = tags
      .slice(0, MAX_SEARCH_TAG_LIMIT)
      .reduce((acc, tag, i) => {
        return (
          acc + (i > 0 ? "|" : "") + `^g:${getCaptionGroupTagName(tag)}:.*$`
        );
      }, "");
    filters.tags = {
      $regex: tagRegex,
    };
  }
  const matchStage: Record<string, any> =
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
  const stages: Record<string, any>[] = [
    {
      $match: matchStage,
    },
    {
      $sort: { _created_at: -1 },
    },
  ];
  if (normalizedTitleFilter) {
    // The original title lives on the video document, so the video join has to
    // happen before captions can be matched on it. The $match above has already
    // narrowed the pipeline down (for a profile page, to a single captioner's
    // captions via the creatorId index) and the join itself is served by the
    // videos.sourceId index, so only the documents that $skip/$limit actually
    // pull through the pipeline get joined.
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
  stages.push({
    $skip: offset,
  });
  if (limit >= 0) {
    stages.push({
      $limit: limit + 1,
    });
  }
  // The video has already been joined on above when filtering by title.
  stages.push(
    ...(normalizedTitleFilter
      ? CAPTIONER_JOIN_PIPELINE
      : CAPTION_DETAILS_JOIN_PIPELINE),
  );

  return stages;
};

const getCaptionResult = async (param: GetCaptionBaseParam) => {
  const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
  const result: Record<string, any>[] = await query.aggregate(
    buildCaptionQueryStages(param),
  );
  return result;
};

/**
 * Retrieves an array CaptionListFields
 * For non captioner limited lists, cannot get non-public captions
 * @param
 * @returns
 */
export const getCaptions: GetCaptionsWithDetails = async (param) => {
  let result = await Promise.all(
    (await getCaptionResult(param)).map(
      async (caption: Record<string, any>, i: number) => {
        return await captionWithJoinedDataToListFields(caption);
      },
    ),
  );
  const { limit } = param;
  const hasMore = limit >= 0 ? result.length > limit : false;
  return {
    result: limit >= 0 ? result.slice(0, limit) : result,
    hasMore,
  };
};

export const getCaptionCount: GetCaptionsWithCountOnly = async (param) => {
  return (await getCaptionResult(param)).length;
};

/**
 * Get the captions of a specific captioner from the perspective of a user
 * @param param0
 * @returns
 */
export const getCaptionerCaptions = async ({
  limit = 20,
  offset = 0,
  captionerId: captionerId,
  userId,
  tags,
  advancedFilter,
  titleFilter,
}: Pick<
  Parameters<typeof getCaptions>[0],
  | "limit"
  | "offset"
  | "captionerId"
  | "userId"
  | "tags"
  | "advancedFilter"
  | "titleFilter"
>) => {
  return await getCaptions({
    limit,
    offset,
    captionerId,
    userId,
    getRejected: true,
    tags,
    advancedFilter,
    titleFilter,
  });
};
