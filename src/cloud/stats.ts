import { StatsResponse } from "@/common/feature/stats/types";
import { PARSE_CLASS } from "./constants";
import { captionWithJoinedDataToListFields } from "./captions/caption-to-list-field";
import { CAPTION_DETAILS_JOIN_PIPELINE } from "./captions/caption-details-join-pipeline";

async function getTotalViews(): Promise<number> {
  const query = new Parse.Query(PARSE_CLASS.captions);
  const result = await query.aggregate({
    group: { objectId: "", views: { $sum: "$views" } },
  });
  return result[0]?.views || 0;
}

async function getTotalCaptions(): Promise<number> {
  const query = new Parse.Query(PARSE_CLASS.captions);
  const result = await query.aggregate({
    group: { objectId: "", count: { $sum: 1 } },
  });
  return result[0]?.count || 0;
}

async function getTotalViewsPerLanguage() {
  const query = new Parse.Query(PARSE_CLASS.captions);
  return (
    await query.aggregate([
      {
        group: { objectId: "$language", views: { $sum: "$views" } },
      },
      {
        match: { views: { $gt: 0 } },
      },
      {
        sort: { views: -1 },
      },
    ])
  ).map((languageView: { views: number; objectId: string }) => {
    return {
      views: languageView.views,
      languageCode: languageView.objectId,
    };
  });
}

async function getTotalCaptionsPerLanguage() {
  const query = new Parse.Query(PARSE_CLASS.captions);
  return (
    await query.aggregate([
      {
        group: { objectId: "$language", count: { $sum: 1 } },
      },
      {
        sort: { count: -1 },
      },
    ])
  ).map((languageView: { count: number; objectId: string }) => {
    return {
      count: languageView.count,
      languageCode: languageView.objectId,
    };
  });
}

async function getTopCaptionsOfAllTime() {
  const query = new Parse.Query(PARSE_CLASS.captions);
  return Promise.all(
    (
      await query.aggregate([
        {
          sort: { views: -1 },
        },
        {
          limit: 5,
        },
        ...CAPTION_DETAILS_JOIN_PIPELINE,
      ])
    ).map(async (caption: Record<string, any>) => {
      return await captionWithJoinedDataToListFields(caption);
    })
  );
}

async function getTopCaptionsUploadedThisMonth() {
  const query = new Parse.Query(PARSE_CLASS.captions);
  const thisMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  return Promise.all(
    (
      await query.aggregate([
        {
          match: { createdAt: { $gte: thisMonth } },
        },
        {
          sort: { views: -1 },
        },
        {
          limit: 5,
        },
        ...CAPTION_DETAILS_JOIN_PIPELINE,
      ])
    ).map(async (caption: Record<string, any>) => {
      return await captionWithJoinedDataToListFields(caption);
    })
  );
}

Parse.Cloud.define(
  "globalStats",
  async (request: Parse.Cloud.FunctionRequest): Promise<StatsResponse> => {
    const [
      totalViews,
      totalCaptions,
      totalViewsPerLanguage,
      totalCaptionsPerLanguage,
      topCaptionsAllTime,
      topCaptionsUploadedThisMonth,
    ] = await Promise.all([
      getTotalViews(),
      getTotalCaptions(),
      getTotalViewsPerLanguage(),
      getTotalCaptionsPerLanguage(),
      getTopCaptionsOfAllTime(),
      getTopCaptionsUploadedThisMonth(),
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
);
