import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  SINGLETON_ID,
  TOTAL_SUPPORTED_SITES,
  floorTo,
} from "../constants";
import { Caption } from "../shared/schemas/caption.schema";
import {
  HomepageStats,
  HomepageStatsDocument,
} from "./schemas/homepage-stats.schema";

export type HomepageStatsPayload = {
  totalViews: number;
  totalCaptions: number;
  totalCaptioners: number;
  totalLanguages: number;
  totalSites: number;
  computedAt: string;
};

@Injectable()
export class HomepageStatsService {
  private readonly logger = new Logger(HomepageStatsService.name);

  constructor(
    @InjectModel(HomepageStats.name)
    private readonly statsModel: Model<HomepageStatsDocument>,
    @InjectModel(Caption.name)
    private readonly captionModel: Model<Caption>,
  ) {}

  async readCache(): Promise<HomepageStatsPayload | null> {
    const doc = await this.statsModel.findById(SINGLETON_ID).lean().exec();
    if (!doc) return null;
    return {
      totalViews: doc.totalViews,
      totalCaptions: doc.totalCaptions,
      totalCaptioners: doc.totalCaptioners,
      totalLanguages: doc.totalLanguages,
      totalSites: doc.totalSites,
      computedAt: new Date(doc.computedAt).toISOString(),
    };
  }

  async hasCache(): Promise<boolean> {
    const count = await this.statsModel
      .countDocuments({ _id: SINGLETON_ID })
      .exec();
    return count > 0;
  }

  async recompute(): Promise<HomepageStatsPayload> {
    this.logger.log("Recomputing homepage stats");
    const startedAt = Date.now();

    const [viewsAgg, captionsCount, captionersAgg, distinctLanguages] =
      await Promise.all([
        this.captionModel
          .aggregate<{ views: number }>([
            { $group: { _id: null, views: { $sum: "$views" } } },
          ])
          .exec(),
        this.captionModel.countDocuments({}).exec(),
        this.captionModel
          .aggregate<{ count: number }>([
            { $group: { _id: "$creatorId" } },
            { $count: "count" },
          ])
          .exec(),
        this.captionModel
          .distinct("language", { language: { $ne: null } })
          .exec() as Promise<string[]>,
      ]);

    const rawViews = viewsAgg[0]?.views ?? 0;
    const rawCaptioners = captionersAgg[0]?.count ?? 0;
    const baseLanguages = new Set(
      distinctLanguages.map((code) => code.replace("-", "_").split("_")[0]),
    );
    const rawLanguages = baseLanguages.size;

    const computedAt = new Date();
    const payload = {
      totalViews: floorTo(rawViews, 100_000),
      totalCaptions: floorTo(captionsCount, 100),
      totalCaptioners: floorTo(rawCaptioners, 100),
      totalLanguages: rawLanguages,
      totalSites: TOTAL_SUPPORTED_SITES,
      computedAt,
    };

    await this.statsModel
      .updateOne(
        { _id: SINGLETON_ID },
        { $set: payload },
        { upsert: true },
      )
      .exec();

    this.logger.log(
      `Homepage stats recomputed in ${Date.now() - startedAt}ms`,
    );

    return {
      ...payload,
      computedAt: computedAt.toISOString(),
    };
  }
}
