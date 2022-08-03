import {
  CaptionListFields,
  CaptionPrivacy,
} from "@/common/feature/video/types";
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
}: {
  limit: number;
  offset: number;
  captionerId?: string;
  userId?: string;
  getRejected: boolean;
  languageCodes?: string[];
}): Promise<CaptionListFields[]> => {
  const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);

  const filters: {
    creatorId?: string;
    privacy?: any;
    rejected?: any;
    language?: any;
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

  const result = await Promise.all(
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
          limit: limit,
        },
        ...CAPTION_DETAILS_JOIN_PIPELINE,
      ])
    ).map(async (caption: Record<string, any>, i: number) => {
      return await captionWithJoinedDataToListFields(caption);
    })
  );
  return result;
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
}: Pick<
  Parameters<typeof getCaptions>[0],
  "limit" | "offset" | "captionerId" | "userId"
>) => {
  return await getCaptions({
    limit,
    offset,
    captionerId,
    userId,
    getRejected: true,
  });
};
