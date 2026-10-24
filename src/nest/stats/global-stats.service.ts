import { Inject, Injectable } from "@nestjs/common";
import { CaptionsService } from "../captions/captions.service";
import type { StatsResponse } from "../shared/api-types";
import {
  CAPTION_DETAILS_JOIN_PIPELINE,
  type JoinedCaptionDoc,
  toCaptionListFields,
} from "../shared/caption-pipeline";

@Injectable()
export class GlobalStatsService {
  constructor(
    @Inject(CaptionsService) private readonly captions: CaptionsService,
  ) {}

  private async getTotalViews(): Promise<number> {
    const [result] = await this.captions.aggregate<{ views: number }>([
      { $group: { _id: "", views: { $sum: "$views" } } },
    ]);
    return result?.views || 0;
  }

  private async getTotalCaptions(): Promise<number> {
    return this.captions.collection().countDocuments({});
  }

  private async getTotalViewsPerLanguage() {
    const results = await this.captions.aggregate<{
      _id: string;
      views: number;
    }>([
      { $group: { _id: "$language", views: { $sum: "$views" } } },
      { $match: { views: { $gt: 0 } } },
      { $sort: { views: -1 } },
    ]);
    return results.map(({ _id, views }) => ({ views, languageCode: _id }));
  }

  private async getTotalCaptionsPerLanguage() {
    const results = await this.captions.aggregate<{
      _id: string;
      count: number;
    }>([
      { $group: { _id: "$language", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return results.map(({ _id, count }) => ({ count, languageCode: _id }));
  }

  private async getTopCaptions(since?: Date) {
    const results = await this.captions.aggregate<JoinedCaptionDoc>([
      ...(since ? [{ $match: { _created_at: { $gte: since } } }] : []),
      { $sort: { views: -1 } },
      { $limit: 5 },
      ...CAPTION_DETAILS_JOIN_PIPELINE,
    ]);
    return results.map(toCaptionListFields);
  }

  async getGlobalStats(): Promise<StatsResponse> {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [
      totalViews,
      totalCaptions,
      totalViewsPerLanguage,
      totalCaptionsPerLanguage,
      topCaptionsAllTime,
      topCaptionsUploadedThisMonth,
    ] = await Promise.all([
      this.getTotalViews(),
      this.getTotalCaptions(),
      this.getTotalViewsPerLanguage(),
      this.getTotalCaptionsPerLanguage(),
      this.getTopCaptions(),
      this.getTopCaptions(thisMonth),
    ]);
    return {
      status: "success",
      result: {
        totalViews,
        totalCaptions,
        totalViewsPerLanguage,
        totalCaptionsPerLanguage,
        topCaptionsAllTime,
        topCaptionsUploadedThisMonth,
      },
    };
  }
}
