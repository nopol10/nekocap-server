import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { VIDEOS_COLLECTION } from "../../constants";

// Map of language code to the number of captions in that language. Mirrors
// VideoCaptionData in nekocap's src/common/feature/video/types.ts.
export type VideoCaptionData = Record<string, number>;

@Schema({ collection: VIDEOS_COLLECTION, strict: false })
export class Video {
  @Prop({ type: String })
  sourceId?: string;

  @Prop({ type: Number })
  source?: number;

  @Prop({ type: String })
  name?: string;

  @Prop({ type: String })
  language?: string;

  @Prop({ type: String })
  sourceCreatorId?: string;

  @Prop({ type: Object })
  captions?: VideoCaptionData;

  @Prop({ type: Number })
  captionCount?: number;
}

export const VideoSchema = SchemaFactory.createForClass(Video);
