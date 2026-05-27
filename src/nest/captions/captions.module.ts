import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CaptionsController } from "./captions.controller";
import { CaptionsService } from "./captions.service";
import { Caption, CaptionSchema } from "../shared/schemas/caption.schema";
import { Video, VideoSchema } from "./schemas/video.schema";
import { Captioner, CaptionerSchema } from "./schemas/captioner.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Caption.name, schema: CaptionSchema },
      { name: Video.name, schema: VideoSchema },
      { name: Captioner.name, schema: CaptionerSchema },
    ]),
  ],
  controllers: [CaptionsController],
  providers: [CaptionsService],
})
export class CaptionsModule {}
