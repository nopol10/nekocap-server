import { Module } from "@nestjs/common";
import { CaptionersModule } from "../captioners/captioners.module";
import { CaptionsModule } from "../captions/captions.module";
import { MigrationModule } from "../migration/migration.module";
import { SearchModule } from "../search/search.module";
import { StatsModule } from "../stats/stats.module";
import { UsersModule } from "../users/users.module";
import { VideosModule } from "../videos/videos.module";
import { CloudBridgeService } from "./cloud-bridge.service";

@Module({
  imports: [
    CaptionsModule,
    CaptionersModule,
    SearchModule,
    StatsModule,
    VideosModule,
    MigrationModule,
    UsersModule,
  ],
  providers: [CloudBridgeService],
  exports: [CloudBridgeService],
})
export class LegacyModule {}
