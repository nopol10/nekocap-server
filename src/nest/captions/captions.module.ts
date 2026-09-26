import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Caption, CaptionSchema } from "../shared/schemas/caption.schema";
import { UsersModule } from "../users/users.module";
import { VideosModule } from "../videos/videos.module";
import { CaptionCountersService } from "./caption-counters.service";
import { CaptionFeedbackService } from "./caption-feedback.service";
import { CaptionSubmissionService } from "./caption-submission.service";
import { CaptionsController } from "./captions.controller";
import { CaptionsService } from "./captions.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Caption.name, schema: CaptionSchema }]),
    UsersModule,
    VideosModule,
  ],
  controllers: [CaptionsController],
  providers: [
    CaptionsService,
    CaptionCountersService,
    CaptionSubmissionService,
    CaptionFeedbackService,
  ],
  exports: [
    CaptionsService,
    CaptionCountersService,
    CaptionSubmissionService,
    CaptionFeedbackService,
  ],
})
export class CaptionsModule {}
