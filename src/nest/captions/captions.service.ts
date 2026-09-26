import { Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, PipelineStage } from "mongoose";
import { isAss } from "@/common/caption-utils";
import {
  CAPTION_LIKES_COLLECTION,
  CAPTIONS_COLLECTION,
  ERROR_MESSAGES,
} from "../constants";
import type { CaptionDoc, CaptionLikesDoc } from "../parse-compat/documents";
import { FilesService } from "../parse-compat/files.service";
import { ParseDbService } from "../parse-compat/parse-db.service";
import { RolesService } from "../parse-compat/roles.service";
import type {
  BrowseResponse,
  CaptionListFields,
  CaptionObjectJSON,
  CaptionsRequest,
  CaptionsResponse,
  LoadCaptionForReviewResponse,
  LoadCaptionsResult,
  LoadSingleCaptionResponse,
  RawCaptionData,
} from "../shared/api-types";
import {
  CAPTIONER_JOIN_PIPELINE,
  type CaptionQueryParams,
  type JoinedCaptionDoc,
  buildCaptionQueryStages,
  toCaptionListFields,
} from "../shared/caption-pipeline";
import { Caption } from "../shared/schemas/caption.schema";
import type { RequestContext } from "../shared/request-context";
import { canViewCaption, getRelatedLanguageCodes } from "../shared/utils";
import { CaptionPrivacy } from "../shared/video-source";
import { UsersService } from "../users/users.service";
import { VideosService } from "../videos/videos.service";
import { CaptionCountersService } from "./caption-counters.service";

export type { CaptionListFields };

export type CaptionsResponsePayload = CaptionsResponse;

type CaptionerCaptionsParams = Pick<
  CaptionQueryParams,
  | "limit"
  | "offset"
  | "captionerId"
  | "userId"
  | "tags"
  | "advancedFilter"
  | "titleFilter"
>;

const MAX_BROWSE_LIMIT = 100;

@Injectable()
export class CaptionsService {
  constructor(
    @InjectModel(Caption.name)
    private readonly captionModel: Model<Caption>,
    @Inject(ParseDbService) private readonly db: ParseDbService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(VideosService) private readonly videos: VideosService,
    @Inject(CaptionCountersService)
    private readonly counters: CaptionCountersService,
  ) {}

  collection() {
    return this.db.collection<CaptionDoc>(CAPTIONS_COLLECTION);
  }

  async findById(captionId: string): Promise<CaptionDoc | null> {
    if (typeof captionId !== "string" || !captionId) {
      return null;
    }
    return this.collection().findOne({ _id: captionId });
  }

  //#region Lists

  async aggregate<T>(stages: PipelineStage[]): Promise<T[]> {
    return this.captionModel.aggregate<T>(stages).exec();
  }

  /**
   * Retrieves a page of captions.
   * For non captioner limited lists, cannot get non-public captions
   */
  async getCaptions(
    params: CaptionQueryParams,
  ): Promise<{ result: CaptionListFields[]; hasMore: boolean }> {
    const docs = await this.aggregate<JoinedCaptionDoc>(
      buildCaptionQueryStages(params),
    );
    const result = docs.map(toCaptionListFields);
    const { limit } = params;
    return {
      result: limit >= 0 ? result.slice(0, limit) : result,
      hasMore: limit >= 0 ? result.length > limit : false,
    };
  }

  async countCaptions(params: CaptionQueryParams): Promise<number> {
    const [result] = await this.aggregate<{ count: number }>([
      ...buildCaptionQueryStages({ ...params, limit: -1 }),
      { $count: "count" },
    ]);
    return result?.count || 0;
  }

  /**
   * Get the captions of a specific captioner from the perspective of a user
   */
  async getCaptionerCaptions({
    limit = 20,
    offset = 0,
    ...params
  }: CaptionerCaptionsParams) {
    return this.getCaptions({ ...params, limit, offset, getRejected: true });
  }

  async getLatest(): Promise<CaptionsResponse> {
    const { result } = await this.getCaptions({
      limit: 10,
      offset: 0,
      getRejected: false,
      tags: [],
    });
    return { status: "success", captions: result };
  }

  /**
   * Latest captions in the given language, including the base language and
   * its sub languages
   */
  async getLatestInLanguage(languageCode: string): Promise<CaptionsResponse> {
    languageCode = String(languageCode ?? "");
    const { result } = await this.getCaptions({
      limit: 10,
      offset: 0,
      getRejected: false,
      languageCodes: getRelatedLanguageCodes(languageCode || ""),
      tags: [],
    });
    return { status: "success", captions: result, hasMore: false };
  }

  /**
   * Popular captions based on likes vs dislike count
   */
  async getPopular(ctx: RequestContext): Promise<CaptionsResponse> {
    const docs = await this.aggregate<JoinedCaptionDoc>([
      { $match: { rejected: { $ne: true }, likes: { $gt: 0 } } },
      { $sort: { likes: -1 } },
      { $limit: 100 },
      // Popular captions have always been matched to videos by id only
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
      ...CAPTIONER_JOIN_PIPELINE,
    ]);
    const captions = docs
      .filter((doc) => canViewCaption(doc, ctx.user?.id))
      .map(toCaptionListFields)
      .filter((caption) => caption.likes > caption.dislikes)
      .slice(0, 10);
    return { status: "success", captions, hasMore: false };
  }

  /**
   * Browse public captions. When the requested page is past the last page,
   * the last page is returned instead.
   */
  async browse({
    limit = 0,
    offset = 0,
  }: {
    limit?: number;
    offset?: number;
  }): Promise<BrowseResponse> {
    limit = Math.max(0, Number(limit) || 0);
    offset = Math.max(0, Number(offset) || 0);
    let { result: captions, hasMore } = await this.getCaptions({
      limit: Math.min(limit, MAX_BROWSE_LIMIT),
      offset,
      getRejected: false,
      tags: [],
    });
    let count = 0;
    if (captions.length <= 0 && offset > 0) {
      count = await this.collection().countDocuments({
        privacy: { $in: [null, CaptionPrivacy.Public] },
        rejected: { $ne: true },
      });
      const lastPage = await this.getCaptions({
        limit,
        offset: limit > 0 ? count - (count % limit) : 0,
        getRejected: false,
        tags: [],
      });
      captions = lastPage.result;
      hasMore = lastPage.hasMore;
    } else {
      count = offset + captions.length;
    }
    return {
      status: "success",
      captions: captions.slice(0, limit),
      hasMoreResults: hasMore,
      totalCount: count,
    };
  }

  /**
   * A captioner's captions as seen by the requesting user
   */
  async loadUserCaptions(
    {
      captionerId,
      tags = [],
      limit,
      offset,
      advancedFilter,
      titleFilter,
    }: CaptionsRequest,
    ctx: RequestContext,
  ): Promise<CaptionsResponse> {
    const { result, hasMore } = await this.getCaptionerCaptions({
      captionerId: String(captionerId ?? ""),
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
      userId: ctx.user?.id,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      advancedFilter,
      titleFilter: typeof titleFilter === "string" ? titleFilter : undefined,
    });
    return { status: "success", captions: result, hasMore };
  }

  /**
   * The list of captions available for a video
   */
  async findCaptionsForVideo(
    params: { videoId?: string; videoSource?: string | number },
    ctx: RequestContext,
  ): Promise<LoadCaptionsResult[]> {
    const { videoId, videoSource } = params;
    if (videoId === undefined || videoSource === undefined) {
      return [];
    }
    const docs = await this.aggregate<JoinedCaptionDoc>([
      {
        $match: {
          rejected: { $ne: true },
          videoId: String(videoId),
          videoSource: String(videoSource),
        },
      },
      ...CAPTIONER_JOIN_PIPELINE,
    ]);
    return docs
      .filter((doc) => canViewCaption(doc, ctx.user?.id))
      .map((doc) => ({
        id: doc._id,
        captionerId: doc.creatorId,
        // Checking the results in case the captioner has somehow been deleted
        captionerName: doc.captioner?.name || "",
        verified: doc.verified || false,
        likes: doc.likes || 0,
        dislikes: doc.dislikes || 0,
        languageCode: doc.language,
        tags: doc.tags || [],
        advanced: !!doc.rawContent,
      }));
  }

  //#endregion

  //#region Single caption

  /**
   * The caption in the JSON format of a Parse object
   */
  toCaptionObjectJSON(caption: CaptionDoc): CaptionObjectJSON {
    const {
      _id,
      _created_at,
      _updated_at,
      _acl,
      _rperm,
      _wperm,
      rawFile,
      ...fields
    } = caption;
    void _acl;
    void _rperm;
    void _wperm;
    return {
      ...fields,
      objectId: _id,
      createdAt: _created_at ? new Date(_created_at).toISOString() : undefined,
      updatedAt: _updated_at ? new Date(_updated_at).toISOString() : undefined,
      ...(rawFile
        ? {
            rawFile: {
              __type: "File",
              name: rawFile,
              url: this.files.url(rawFile),
            },
          }
        : {}),
    };
  }

  private async recordView(caption: CaptionDoc): Promise<void> {
    await this.db.updateById<CaptionDoc>(CAPTIONS_COLLECTION, caption._id, {
      $inc: { views: 1 },
    });
    caption.views = (caption.views || 0) + 1;
    await this.counters.onCaptionSaved(caption, caption.privacy);
  }

  /**
   * The raw caption file's url. The client retrieves the file itself.
   * Only Substation Alpha captions need the original file for rendering.
   */
  private getRawCaptionMeta(caption: CaptionDoc): {
    url: string;
    type?: string;
  } {
    if (!caption.rawFile || !caption.rawContent) {
      return { url: "" };
    }
    let type: string | undefined;
    try {
      type = (JSON.parse(caption.rawContent) as RawCaptionData).type;
    } catch (e) {
      type = undefined;
    }
    return { url: this.files.url(caption.rawFile), type };
  }

  async loadCaption(
    captionId: string,
    ctx: RequestContext,
  ): Promise<LoadSingleCaptionResponse> {
    const caption = await this.findById(captionId);
    if (!caption) {
      return { status: "error", error: "Caption not found" };
    }
    const rawCaptionMeta = this.getRawCaptionMeta(caption);
    const rawCaption: RawCaptionData = {
      type: rawCaptionMeta.type || "srt",
      data: "",
    };
    const [video, captioner] = await Promise.all([
      this.videos.findVideo(caption.videoId, caption.videoSource),
      this.users.getUserProfile(caption.creatorId || ""),
      this.recordView(caption),
    ]);
    const response: LoadSingleCaptionResponse = {
      status: "success",
      caption: this.toCaptionObjectJSON(caption),
      rawCaption: JSON.stringify(rawCaption),
      rawCaptionUrl: isAss(rawCaptionMeta.type) ? rawCaptionMeta.url : "",
      originalTitle: video?.name || "",
      captionerName: captioner?.name ?? "Unknown",
    };
    // Get like and dislike data if the user is logged in
    if (ctx.user) {
      const likes = await this.db
        .collection<CaptionLikesDoc>(CAPTION_LIKES_COLLECTION)
        .findOne({ userId: ctx.user.id });
      if (likes) {
        response.userLike = (likes.likes || []).includes(caption._id);
        response.userDislike = (likes.dislikes || []).includes(caption._id);
      }
    }
    return response;
  }

  async loadCaptionForReview(
    captionId: string,
    ctx: RequestContext,
  ): Promise<LoadCaptionForReviewResponse> {
    const caption = await this.findById(captionId);
    if (!caption) {
      return { status: "error", error: "Caption not found" };
    }
    if (!ctx.user) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    const [isAdmin, isReviewer] = await Promise.all([
      this.roles.hasAdminRole(ctx.user.id),
      this.roles.hasReviewerRole(ctx.user.id),
    ]);
    if (!isAdmin && !isReviewer) {
      return { status: "error", error: "Not authorized" };
    }
    await this.recordView(caption);
    const [captioner, video] = await Promise.all([
      this.users.getUserProfile(caption.creatorId || ""),
      this.videos.findVideo(caption.videoId, caption.videoSource),
    ]);
    return {
      status: "success",
      caption: this.toCaptionObjectJSON(caption),
      captioner,
      videoName: video?.name || "",
    };
  }

  //#endregion
}
