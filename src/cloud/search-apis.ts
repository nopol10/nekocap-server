import type { SearchRequest } from "@/common/feature/search/types";
import type { VideoSearchResponse } from "@/common/providers/parse/types";
import { languages } from "@/common/languages";
import {
  getVideoByCaptionTitleQuery,
  getVideoByTitleQuery,
  getVideoByVideoIdQuery,
} from "./search";
import { escapeRegexInString, isTruthy } from "./utils";

/**
 * Search for captions
 */
Parse.Cloud.define(
  "search",
  async (
    request: Parse.Cloud.FunctionRequest<SearchRequest>,
  ): Promise<VideoSearchResponse> => {
    const { title, limit = 0, offset = 0 } = request.params;
    let { videoLanguageCode = "any", captionLanguageCode = "any" } =
      request.params;
    const searchRegex = new RegExp(escapeRegexInString(title), "i");
    // Find videos where the name contains the search string
    if (videoLanguageCode === languages.unk || !videoLanguageCode) {
      videoLanguageCode = "any";
    }
    if (captionLanguageCode === languages.unk || !captionLanguageCode) {
      captionLanguageCode = "any";
    }
    const videoQuery = getVideoByTitleQuery(
      searchRegex,
      captionLanguageCode,
      videoLanguageCode,
    );

    const videosWithCaptionNames = await getVideoByCaptionTitleQuery(
      searchRegex,
      captionLanguageCode,
      videoLanguageCode,
    );
    const videosWithVideoIdQuery = await getVideoByVideoIdQuery(
      searchRegex,
      captionLanguageCode,
      videoLanguageCode,
    );

    const fullQuery = Parse.Query.or(
      ...[videoQuery, videosWithCaptionNames, videosWithVideoIdQuery].filter(
        isTruthy,
      ),
    )
      .descending("updatedAt")
      .limit(limit + 1)
      .skip(offset);

    const videos = await fullQuery.find();

    return {
      status: "success",
      videos: videos.slice(0, limit),
      hasMoreResults: videos.length > limit,
    };
  },
);
