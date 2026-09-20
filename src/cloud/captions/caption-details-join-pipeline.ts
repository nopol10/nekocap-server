/**
 * Joins the video a caption belongs to onto the caption as `video`.
 * Split out from CAPTION_DETAILS_JOIN_PIPELINE so that queries which need to
 * filter on video fields (e.g. the video title) can perform this join earlier
 * in the pipeline without paying for the captioner join as well.
 */
export const VIDEO_JOIN_PIPELINE = [
  {
    $lookup: {
      from: "videos",
      // localField: "videoId",
      // foreignField: "sourceId",
      as: "video",
      // Using the nested pipeline to prevent duplicate videos from returning multiple copies of the same caption
      let: { localField: "$videoId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$sourceId", "$$localField"] } } },
        { $limit: 1 },
      ],
    },
  },
  {
    $unwind: { path: "$video", preserveNullAndEmptyArrays: true },
  },
];

/**
 * Joins the captioner who created a caption onto the caption as `captioner`.
 */
export const CAPTIONER_JOIN_PIPELINE = [
  {
    $lookup: {
      from: "captioner",
      // localField: "creatorId",
      // foreignField: "userId",
      as: "captioner",
      let: { localField: "$creatorId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$userId", "$$localField"] } } },
        { $limit: 1 },
      ],
    },
  },
  {
    $unwind: { path: "$captioner", preserveNullAndEmptyArrays: true },
  },
];

export const CAPTION_DETAILS_JOIN_PIPELINE = [
  ...VIDEO_JOIN_PIPELINE,
  ...CAPTIONER_JOIN_PIPELINE,
];
