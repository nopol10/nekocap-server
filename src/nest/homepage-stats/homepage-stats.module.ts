import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HomepageStatsController } from "./homepage-stats.controller";
import { HomepageStatsCron } from "./homepage-stats.cron";
import { HomepageStatsService } from "./homepage-stats.service";
import { Caption, CaptionSchema } from "../shared/schemas/caption.schema";
import {
  HomepageStats,
  HomepageStatsSchema,
} from "./schemas/homepage-stats.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HomepageStats.name, schema: HomepageStatsSchema },
      { name: Caption.name, schema: CaptionSchema },
    ]),
  ],
  controllers: [HomepageStatsController],
  providers: [HomepageStatsService, HomepageStatsCron],
})
export class HomepageStatsModule {}
