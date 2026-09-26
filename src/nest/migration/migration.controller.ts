import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { Ctx } from "../auth/request-context.guard";
import type { RequestContext } from "../shared/request-context";
import { type MigrationResponse, MigrationService } from "./migration.service";

/**
 * Requires the X-Parse-Master-Key header and maintenance mode
 */
@Controller("admin/migration")
export class MigrationController {
  constructor(
    @Inject(MigrationService) private readonly service: MigrationService,
  ) {}

  @Post("video")
  @HttpCode(200)
  async createVideo(
    @Ctx() ctx: RequestContext,
    @Body() body: Parameters<MigrationService["createVideo"]>[0],
  ): Promise<MigrationResponse> {
    return this.service.createVideo(body, ctx);
  }

  @Post("youtube-videos")
  @HttpCode(200)
  async createBatchYoutubeVideos(
    @Ctx() ctx: RequestContext,
    @Body() body: Parameters<MigrationService["createBatchYoutubeVideos"]>[0],
  ): Promise<MigrationResponse> {
    return this.service.createBatchYoutubeVideos(body, ctx);
  }

  @Post("captioner")
  @HttpCode(200)
  async createCaptionerWithoutUser(
    @Ctx() ctx: RequestContext,
    @Body() body: Parameters<MigrationService["createCaptionerWithoutUser"]>[0],
  ): Promise<MigrationResponse> {
    return this.service.createCaptionerWithoutUser(body, ctx);
  }

  @Post("caption")
  @HttpCode(200)
  async createCaption(
    @Ctx() ctx: RequestContext,
    @Body() body: Parameters<MigrationService["createCaption"]>[0],
  ): Promise<MigrationResponse> {
    return this.service.createCaption(body, ctx);
  }
}
