import { Controller, Get, HttpCode, Inject, Query } from "@nestjs/common";
import type { AutoCaptionListResponse } from "../shared/api-types";
import { VideosService } from "./videos.service";

@Controller("videos")
export class VideosController {
  constructor(@Inject(VideosService) private readonly service: VideosService) {}

  @Get("auto-captions")
  @HttpCode(200)
  async getAutoCaptionList(
    @Query("videoId") videoId?: string,
    @Query("videoSource") videoSource?: string,
  ): Promise<AutoCaptionListResponse> {
    return this.service.getAutoCaptionList({ videoId, videoSource });
  }
}
