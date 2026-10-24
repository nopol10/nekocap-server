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
import { CaptionsService } from "../captions/captions.service";
import type {
  AdvancedFilter,
  CaptionsResponse,
  GetOwnProfileTagsResponse,
  PrivateCaptionerDataResponse,
  PublicProfileResponse,
  ServerResponse,
  UpdateCaptionerProfileRequest,
} from "../shared/api-types";
import type { RequestContext } from "../shared/request-context";
import { CaptionersService } from "./captioners.service";

const toNumber = (value?: string): number | undefined =>
  value === undefined || value === "" ? undefined : parseInt(value, 10);

const toList = (value?: string | string[]): string[] => {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

@Controller("captioners")
export class CaptionersController {
  constructor(
    @Inject(CaptionersService) private readonly service: CaptionersService,
    @Inject(CaptionsService) private readonly captions: CaptionsService,
  ) {}

  @Get("me")
  @HttpCode(200)
  async loadPrivateCaptionerData(
    @Ctx() ctx: RequestContext,
    @Query("withCaptions") withCaptions?: string,
  ): Promise<PrivateCaptionerDataResponse> {
    return this.service.loadPrivateCaptionerData(
      { withCaptions: withCaptions !== "false" },
      ctx,
    );
  }

  @Patch("me")
  @HttpCode(200)
  async updateProfile(
    @Ctx() ctx: RequestContext,
    @Body() body: UpdateCaptionerProfileRequest,
  ): Promise<PrivateCaptionerDataResponse> {
    return this.service.updateCaptionerProfile(body || ({} as never), ctx);
  }

  @Get("me/tags")
  @HttpCode(200)
  async getOwnProfileTags(
    @Ctx() ctx: RequestContext,
  ): Promise<GetOwnProfileTagsResponse> {
    return this.service.getOwnProfileTags(ctx);
  }

  @Delete("me/tags/:tagName")
  @HttpCode(200)
  async deleteProfileTag(
    @Ctx() ctx: RequestContext,
    @Param("tagName") tagName: string,
  ): Promise<ServerResponse> {
    return this.service.deleteProfileTag(tagName, ctx);
  }

  @Get(":userId")
  @HttpCode(200)
  async loadProfile(
    @Ctx() ctx: RequestContext,
    @Param("userId") userId: string,
    @Query("withCaptions") withCaptions?: string,
  ): Promise<PublicProfileResponse> {
    return this.service.loadProfile(
      { profileId: userId, withCaptions: withCaptions !== "false" },
      ctx,
    );
  }

  @Get(":userId/captions")
  @HttpCode(200)
  async loadCaptions(
    @Ctx() ctx: RequestContext,
    @Param("userId") userId: string,
    @Query("tags") tags?: string | string[],
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("advancedFilter") advancedFilter?: AdvancedFilter,
    @Query("titleFilter") titleFilter?: string,
  ): Promise<CaptionsResponse> {
    return this.captions.loadUserCaptions(
      {
        captionerId: userId,
        tags: toList(tags),
        limit: toNumber(limit),
        offset: toNumber(offset),
        advancedFilter,
        titleFilter,
      },
      ctx,
    );
  }

  @Post(":userId/verify")
  @HttpCode(200)
  async verify(
    @Ctx() ctx: RequestContext,
    @Param("userId") userId: string,
  ): Promise<ServerResponse> {
    return this.service.verifyCaptioner(userId, ctx);
  }

  @Post(":userId/ban")
  @HttpCode(200)
  async ban(
    @Ctx() ctx: RequestContext,
    @Param("userId") userId: string,
  ): Promise<ServerResponse> {
    return this.service.banCaptioner(userId, ctx);
  }

  @Post(":userId/roles/reviewer")
  @HttpCode(200)
  async assignReviewer(
    @Ctx() ctx: RequestContext,
    @Param("userId") userId: string,
  ): Promise<ServerResponse> {
    return this.service.assignReviewerRole(userId, ctx);
  }

  @Post(":userId/roles/reviewer-manager")
  @HttpCode(200)
  async assignReviewerManager(
    @Ctx() ctx: RequestContext,
    @Param("userId") userId: string,
  ): Promise<ServerResponse> {
    return this.service.assignReviewerManagerRole(userId, ctx);
  }
}
