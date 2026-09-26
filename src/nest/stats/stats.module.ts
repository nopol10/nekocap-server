import { Module } from "@nestjs/common";
import { CaptionsModule } from "../captions/captions.module";
import { GlobalStatsService } from "./global-stats.service";
import { StatsController } from "./stats.controller";

@Module({
  imports: [CaptionsModule],
  controllers: [StatsController],
  providers: [GlobalStatsService],
  exports: [GlobalStatsService],
})
export class StatsModule {}
