export const CAPTION_DETAILS_JOIN_PIPELINE = [
  {
    lookup: {
      from: "videos",
      localField: "videoId",
      foreignField: "sourceId",
      as: "video",
    },
  },
  {
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
    unwind: { path: "$captioner", preserveNullAndEmptyArrays: true },
  },
];
