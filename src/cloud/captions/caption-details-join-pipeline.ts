export const CAPTION_DETAILS_JOIN_PIPELINE = [
  {
    lookup: {
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
    unwind: { path: "$video", preserveNullAndEmptyArrays: true },
  },
  {
    lookup: {
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
    unwind: { path: "$captioner", preserveNullAndEmptyArrays: true },
  },
];
