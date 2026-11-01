import { Controller, Get, HttpCode, Inject } from "@nestjs/common";
import type { StatsResponse } from "../shared/api-types";
import { GlobalStatsService } from "./global-stats.service";

@Controller("stats")
export class StatsController {
  constructor(
    @Inject(GlobalStatsService) private readonly service: GlobalStatsService,
  ) {}

  @Get("global")
  @HttpCode(200)
  async getGlobalStats(): Promise<StatsResponse> {
    return this.service.getGlobalStats();
  }
}
