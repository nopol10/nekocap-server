import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { Caption, CaptionSchema } from "../shared/schemas/caption.schema";
import { Video, VideoSchema } from "../shared/schemas/video.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Caption.name, schema: CaptionSchema },
      { name: Video.name, schema: VideoSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
