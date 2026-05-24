import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { HOMEPAGE_STATS_COLLECTION } from "../../constants";

export type HomepageStatsDocument = HydratedDocument<HomepageStats>;

@Schema({ collection: HOMEPAGE_STATS_COLLECTION, _id: false })
export class HomepageStats {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: Number, required: true, default: 0 })
  totalViews!: number;

  @Prop({ type: Number, required: true, default: 0 })
  totalCaptions!: number;

  @Prop({ type: Number, required: true, default: 0 })
  totalCaptioners!: number;

  @Prop({ type: Number, required: true, default: 0 })
  totalLanguages!: number;

  @Prop({ type: Number, required: true, default: 0 })
  totalSites!: number;

  @Prop({ type: Date, required: true })
  computedAt!: Date;
}

export const HomepageStatsSchema = SchemaFactory.createForClass(HomepageStats);
