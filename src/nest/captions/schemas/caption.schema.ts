import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { CAPTIONS_COLLECTION } from "../../constants";

@Schema({ collection: CAPTIONS_COLLECTION, strict: false })
export class Caption {
  @Prop({ type: String })
  videoId?: string;

  @Prop({ type: Number })
  videoSource?: number;

  @Prop({ type: String })
  language?: string;

  @Prop({ type: String })
  creatorId?: string;

  @Prop({ type: Number })
  views?: number;

  @Prop({ type: String })
  translatedTitle?: string;

  @Prop({ type: Number })
  likes?: number;

  @Prop({ type: Number })
  dislikes?: number;

  @Prop({ type: Boolean })
  verified?: boolean;

  @Prop({ type: Boolean })
  rejected?: boolean;

  @Prop({ type: [String] })
  tags?: string[];

  @Prop({ type: Number })
  privacy?: number;

  @Prop({ type: String })
  rawContent?: string;
}

export const CaptionSchema = SchemaFactory.createForClass(Caption);
