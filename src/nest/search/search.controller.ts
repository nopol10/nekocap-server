import { Controller, Get, HttpCode, Inject, Query } from "@nestjs/common";
import { SearchService, VideoSearchResponsePayload } from "./search.service";

@Controller("search")
export class SearchController {
  constructor(@Inject(SearchService) private readonly service: SearchService) {}

  @Get()
  @HttpCode(200)
  async search(
    @Query("title") title = "",
    @Query("videoLanguageCode") videoLanguageCode?: string,
    @Query("captionLanguageCode") captionLanguageCode?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<VideoSearchResponsePayload> {
    return this.service.search({
      title,
      videoLanguageCode,
      captionLanguageCode,
      limit: limit ? parseInt(limit, 10) : 0,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }
}
