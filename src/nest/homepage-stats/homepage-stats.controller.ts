import { Controller, Get, HttpCode } from "@nestjs/common";
import {
  HomepageStatsPayload,
  HomepageStatsService,
} from "./homepage-stats.service";

@Controller("homepage-stats")
export class HomepageStatsController {
  constructor(private readonly service: HomepageStatsService) {}

  @Get()
  @HttpCode(200)
  async getStats(): Promise<HomepageStatsPayload | { ready: false }> {
    const cached = await this.service.readCache();
    if (!cached) return { ready: false };
    return cached;
  }
}
