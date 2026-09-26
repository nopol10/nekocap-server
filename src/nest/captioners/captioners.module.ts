import { Module } from "@nestjs/common";
import { CaptionsModule } from "../captions/captions.module";
import { UsersModule } from "../users/users.module";
import { CaptionersController } from "./captioners.controller";
import { CaptionersService } from "./captioners.service";

@Module({
  imports: [CaptionsModule, UsersModule],
  controllers: [CaptionersController],
  providers: [CaptionersService],
  exports: [CaptionersService],
})
export class CaptionersModule {}
