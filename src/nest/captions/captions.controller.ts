import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Ctx } from "../auth/request-context.guard";
import type {
  BrowseResponse,
  CaptionsResponse,
  LoadCaptionForReviewResponse,
  LoadCaptionsResult,
  LoadSingleCaptionResponse,
  ServerResponse,
  SubmitCaptionRequest,
  UpdateCaptionRequest,
  UploadResponse,
} from "../shared/api-types";
import type { RequestContext } from "../shared/request-context";
import { CaptionFeedbackService } from "./caption-feedback.service";
import { CaptionSubmissionService } from "./caption-submission.service";
import { CaptionsService } from "./captions.service";

const toNumber = (value?: string): number | undefined =>
  value === undefined || value === "" ? undefined : parseInt(value, 10);

@Controller("captions")
export class CaptionsController {
  constructor(
    @Inject(CaptionsService) private readonly service: CaptionsService,
    @Inject(CaptionSubmissionService)
    private readonly submissions: CaptionSubmissionService,
    @Inject(CaptionFeedbackService)
    private readonly feedback: CaptionFeedbackService,
  ) {}

  /** The captions available for a video */
  @Get()
  @HttpCode(200)
  async findForVideo(
    @Ctx() ctx: RequestContext,
    @Query("videoId") videoId?: string,
    @Query("videoSource") videoSource?: string,
  ): Promise<LoadCaptionsResult[]> {
    return this.service.findCaptionsForVideo({ videoId, videoSource }, ctx);
  }

  @Get("latest")
  @HttpCode(200)
  async getLatest(): Promise<CaptionsResponse> {
    return this.service.getLatest();
  }

  @Get("latest/:languageCode")
  @HttpCode(200)
  async getLatestInLanguage(
    @Param("languageCode") languageCode: string,
  ): Promise<CaptionsResponse> {
    return this.service.getLatestInLanguage(languageCode);
  }

  @Get("popular")
  @HttpCode(200)
  async getPopular(@Ctx() ctx: RequestContext): Promise<CaptionsResponse> {
    return this.service.getPopular(ctx);
  }

  @Get("browse")
  @HttpCode(200)
  async browse(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<BrowseResponse> {
    return this.service.browse({
      limit: toNumber(limit),
      offset: toNumber(offset),
    });
  }

  @Post()
  @HttpCode(200)
  async submit(
    @Ctx() ctx: RequestContext,
    @Body() body: SubmitCaptionRequest,
  ): Promise<UploadResponse> {
    return this.submissions.submitCaption(body || ({} as never), ctx);
  }

  @Get(":id")
  @HttpCode(200)
  async load(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<LoadSingleCaptionResponse> {
    return this.service.loadCaption(id, ctx);
  }

  @Get(":id/review")
  @HttpCode(200)
  async loadForReview(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<LoadCaptionForReviewResponse> {
    return this.service.loadCaptionForReview(id, ctx);
  }

  @Patch(":id")
  @HttpCode(200)
  async update(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
    @Body() body: Omit<UpdateCaptionRequest, "captionId">,
  ): Promise<UploadResponse> {
    return this.submissions.updateCaption({ ...body, captionId: id }, ctx);
  }

  @Delete(":id")
  @HttpCode(200)
  async delete(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<ServerResponse> {
    return this.submissions.deleteCaption(id, ctx);
  }

  @Post(":id/like")
  @HttpCode(200)
  async like(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<ServerResponse> {
    return this.feedback.likeCaption(id, ctx);
  }

  @Post(":id/dislike")
  @HttpCode(200)
  async dislike(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<ServerResponse> {
    return this.feedback.dislikeCaption(id, ctx);
  }

  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
    @Body() body: { reason?: string } = {},
  ): Promise<ServerResponse> {
    return this.feedback.rejectCaption(
      { captionId: id, reason: body?.reason },
      ctx,
    );
  }

  @Post(":id/verify")
  @HttpCode(200)
  async verify(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
    @Body() body: { reason?: string } = {},
  ): Promise<ServerResponse> {
    return this.feedback.verifyCaption(
      { captionId: id, reason: body?.reason },
      ctx,
    );
  }
}
