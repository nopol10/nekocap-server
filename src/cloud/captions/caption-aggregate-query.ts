import { CaptionsRequest } from "@/common/feature/captioner/types";
import {
  CaptionListFields,
  CaptionPrivacy,
} from "@/common/feature/video/types";
import { CaptionSchema } from "@/common/providers/parse/types";
import { PARSE_CLASS } from "cloud/constants";
import { captionWithJoinedDataToListFields } from "./caption-to-list-field";

export const getCaptions = async ({
  limit = 10,
  offset = 0,
  captionerId,
  userId,
  getRejected = true,
}: {
  limit: number;
  offset: number;
  captionerId?: string;
  userId?: string;
  getRejected: boolean;
}): Promise<CaptionListFields[]> => {
  const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);

  const filters: { creatorId?: string; privacy?: any; rejected?: any } = {};
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
        {
          lookup: {
            from: "videos",
            localField: "videoId",
            foreignField: "sourceId",
            as: "video",
          },
        },
        {
          // @ts-ignore
          unwind: { path: "$video", preserveNullAndEmptyArrays: true },
        },
        {
          lookup: {
            from: "captioner",
            localField: "creatorId",
            foreignField: "userId",
            as: "captioner",
          },
        },
        {
          // @ts-ignore
          unwind: { path: "$captioner", preserveNullAndEmptyArrays: true },
        },
      ])
    ).map(async (caption: Record<string, any>, i: number) => {
      return await captionWithJoinedDataToListFields(caption);
    })
  );
  return result;
};
