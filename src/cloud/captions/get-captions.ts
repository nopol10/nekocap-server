import {
  CaptionListFields,
  CaptionPrivacy,
} from "@/common/feature/video/types";
import { getCaptionGroupTagName } from "@/common/feature/video/utils";
import { CaptionSchema } from "@/common/providers/parse/types";
import { PARSE_CLASS } from "cloud/constants";
import { Query } from "parse/node";
import { CAPTION_DETAILS_JOIN_PIPELINE } from "./caption-details-join-pipeline";
import { captionWithJoinedDataToListFields } from "./caption-to-list-field";

const MAX_SEARCH_TAG_LIMIT = 5;

type GetCaptionBaseParam = {
  limit: number;
  offset: number;
  captionerId?: string;
  userId?: string;
  getRejected: boolean;
  languageCodes?: string[];
  tags: string[];
};

type GetCaptionsWithCountOnly = (param: GetCaptionBaseParam) => Promise<number>;

type GetCaptionsWithDetails = (
  param: GetCaptionBaseParam
) => Promise<{ result: CaptionListFields[]; hasMore: boolean }>;

const getCaptionResult = async ({
  limit = 10,
  offset = 0,
  captionerId,
  userId,
  getRejected = true,
  languageCodes,
  tags = [],
}: GetCaptionBaseParam) => {
  const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);

  const filters: {
    creatorId?: string;
    privacy?: any;
    rejected?: any;
    language?: any;
    tags?: any;
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
  const stages: Query.AggregationOptions[] = [
    {
      match: filters,
    },
    {
      sort: { _created_at: -1 },
    },
    {
      skip: offset,
    },
  ];
  if (limit >= 0) {
    stages.push({
      limit: limit + 1,
    });
  }
  stages.push(...CAPTION_DETAILS_JOIN_PIPELINE);

  let result: Record<string, any>[] = await query.aggregate(stages);
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
    (
      await getCaptionResult(param)
    ).map(async (caption: Record<string, any>, i: number) => {
      return await captionWithJoinedDataToListFields(caption);
    })
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
}: Pick<
  Parameters<typeof getCaptions>[0],
  "limit" | "offset" | "captionerId" | "userId" | "tags"
>) => {
  return await getCaptions({
    limit,
    offset,
    captionerId,
    userId,
    getRejected: true,
    tags,
  });
};
