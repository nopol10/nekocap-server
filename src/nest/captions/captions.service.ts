import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, PipelineStage } from "mongoose";
import { Caption } from "./schemas/caption.schema";

export type CaptionListFields = {
  id: string;
  language?: string;
  videoId?: string;
  videoSource?: number;
  data: string;
  creatorId?: string;
  creatorName: string;
  videoName: string;
  videoLanguage: string;
  views: number;
  translatedTitle?: string;
  likes: number;
  dislikes: number;
  verified: boolean;
  rejected?: boolean;
  createdDate: number;
  updatedDate: number;
  tags: string[];
  privacy: number;
  advanced: boolean;
};

export type CaptionsResponsePayload = {
  status: "success" | "error";
  captions: CaptionListFields[];
};

type AggregatedCaption = {
  _id: unknown;
  _created_at?: Date;
  _updated_at?: Date;
  videoId?: string;
  videoSource?: number;
  language?: string;
  creatorId?: string;
  views?: number;
  translatedTitle?: string;
  likes?: number;
  dislikes?: number;
  verified?: boolean;
  rejected?: boolean;
  tags?: string[];
  privacy?: number;
  rawContent?: string;
  video?: { name?: string; language?: string };
  captioner?: { name?: string };
};

type Paging = {
  limit: number;
  offset: number;
};

const unixSeconds = (date: Date): number =>
  parseInt((date.getTime() / 1000).toFixed(0));

const CAPTION_DETAILS_JOIN_PIPELINE: PipelineStage[] = [
  {
    $lookup: {
      from: "videos",
      as: "video",
      let: { localField: "$videoId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$sourceId", "$$localField"] } } },
        { $limit: 1 },
      ],
    },
  },
  { $unwind: { path: "$video", preserveNullAndEmptyArrays: true } },
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

@Injectable()
export class CaptionsService {
  constructor(
    @InjectModel(Caption.name)
    private readonly captionModel: Model<Caption>,
  ) {}

  async getLatest(): Promise<CaptionsResponsePayload> {
    const captions = await this.aggregateCaptions(
      { rejected: { $ne: true }, privacy: { $in: [null, 0] } },
      { limit: 10, offset: 0 },
    );
    return { status: "success", captions };
  }

  private async aggregateCaptions(
    filter: Record<string, unknown>,
    paging: Paging,
  ): Promise<CaptionListFields[]> {
    const stages: PipelineStage[] = [
      { $match: filter },
      { $sort: { _created_at: -1 } },
      { $skip: paging.offset },
      { $limit: paging.limit + 1 },
      ...CAPTION_DETAILS_JOIN_PIPELINE,
    ];
    const docs = await this.captionModel
      .aggregate<AggregatedCaption>(stages)
      .exec();
    return docs.slice(0, paging.limit).map((doc) => this.toListFields(doc));
  }

  private toListFields(doc: AggregatedCaption): CaptionListFields {
    const createdAt = doc._created_at ? new Date(doc._created_at) : new Date();
    const updatedAt = doc._updated_at ? new Date(doc._updated_at) : new Date();
    return {
      id: String(doc._id),
      language: doc.language,
      videoId: doc.videoId,
      videoSource: doc.videoSource,
      data: "",
      creatorId: doc.creatorId,
      creatorName: doc.captioner?.name || "",
      videoName: doc.video?.name || "",
      videoLanguage: doc.video?.language || "",
      views: doc.views || 0,
      translatedTitle: doc.translatedTitle || undefined,
      likes: doc.likes || 0,
      dislikes: doc.dislikes || 0,
      verified: doc.verified || false,
      rejected: doc.rejected || undefined,
      createdDate: unixSeconds(createdAt),
      updatedDate: unixSeconds(updatedAt),
      tags: doc.tags || [],
      privacy: doc.privacy || 0,
      advanced: !!doc.rawContent,
    };
  }
}
