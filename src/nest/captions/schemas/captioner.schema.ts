import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { CAPTIONER_COLLECTION } from "../../constants";

@Schema({ collection: CAPTIONER_COLLECTION, strict: false })
export class Captioner {
  @Prop({ type: String })
  userId?: string;

  @Prop({ type: String })
  name?: string;
}

export const CaptionerSchema = SchemaFactory.createForClass(Captioner);
