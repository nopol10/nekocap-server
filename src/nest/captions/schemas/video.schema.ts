import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { VIDEOS_COLLECTION } from "../../constants";

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
}

export const VideoSchema = SchemaFactory.createForClass(Video);
