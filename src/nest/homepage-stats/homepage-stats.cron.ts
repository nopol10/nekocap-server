import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { HomepageStatsService } from "./homepage-stats.service";

@Injectable()
export class HomepageStatsCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(HomepageStatsCron.name);

  constructor(private readonly service: HomepageStatsService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const hasCache = await this.service.hasCache();
      if (!hasCache) {
        this.logger.log("No homepage stats cache found; seeding on boot");
        await this.service.recompute();
      }
    } catch (error) {
      this.logger.error("Boot seed of homepage stats failed", error as Error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    try {
      await this.service.recompute();
    } catch (error) {
      this.logger.error("Scheduled homepage stats recompute failed", error as Error);
    }
  }
}
