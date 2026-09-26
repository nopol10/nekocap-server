import { Module } from "@nestjs/common";
import { CaptionsModule } from "../captions/captions.module";
import { UsersModule } from "../users/users.module";
import { VideosModule } from "../videos/videos.module";
import { MigrationController } from "./migration.controller";
import { MigrationService } from "./migration.service";

@Module({
  imports: [CaptionsModule, UsersModule, VideosModule],
  controllers: [MigrationController],
  providers: [MigrationService],
  exports: [MigrationService],
})
export class MigrationModule {}
