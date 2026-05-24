import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { CAPTIONS_COLLECTION } from "../../constants";

@Schema({ collection: CAPTIONS_COLLECTION, strict: false })
export class Caption {
  @Prop({ type: Number })
  views?: number;

  @Prop({ type: String })
  language?: string;

  @Prop({ type: String })
  creatorId?: string;
}

export const CaptionSchema = SchemaFactory.createForClass(Caption);
