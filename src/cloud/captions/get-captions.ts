import {
  CaptionListFields,
  CaptionPrivacy,
} from "@/common/feature/video/types";
import { getCaptionGroupTagName } from "@/common/feature/video/utils";
import { CaptionSchema } from "@/common/providers/parse/types";
import { PARSE_CLASS } from "cloud/constants";
import { CAPTION_DETAILS_JOIN_PIPELINE } from "./caption-details-join-pipeline";
import { captionWithJoinedDataToListFields } from "./caption-to-list-field";

/**
 * Retrieves an array CaptionListFields
 * For non captioner limited lists, cannot get non-public captions
 * @param
 * @returns
 */
export const getCaptions = async ({
  limit = 10,
  offset = 0,
  captionerId,
  userId,
  getRejected = true,
  languageCodes,
  tags = [],
}: {
  limit: number;
  offset: number;
  captionerId?: string;
  userId?: string;
  getRejected: boolean;
  languageCodes?: string[];
  tags: string[];
}): Promise<{ result: CaptionListFields[]; hasMore: boolean }> => {
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
    const tagRegex = tags.reduce((acc, tag, i) => {
      return acc + (i > 0 ? "|" : "") + `^g:${getCaptionGroupTagName(tag)}:.*$`;
    }, "");
    filters.tags = {
      $regex: tagRegex,
    };
  }

  let result = await Promise.all(
    (
      await query.aggregate([
        {
          match: filters,
        },
        {
          sort: { _created_at: -1 },
        },
        {
          skip: offset,
        },
        {
          limit: limit + 1,
        },
        ...CAPTION_DETAILS_JOIN_PIPELINE,
      ])
    ).map(async (caption: Record<string, any>, i: number) => {
      return await captionWithJoinedDataToListFields(caption);
    })
  );
  const hasMore = result.length > limit;
  return {
    result: result.slice(0, limit),
    hasMore,
  };
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
