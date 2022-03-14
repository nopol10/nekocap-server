import { CaptionSchema, VideoSchema } from "@/common/providers/parse/types";
import { PARSE_CLASS } from "./constants";
import { escapeRegexInString, getRelatedLanguageCodes } from "./utils";

export const getVideoByTitleQuery = (
  title: RegExp,
  captionLanguageCode: string,
  videoLanguageCode: string
) => {
  let videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
  if (
    captionLanguageCode &&
    captionLanguageCode !== "any" &&
    !captionLanguageCode.includes("_")
  ) {
    // We need to do a multi query with all the sub languages accounted for
    const languageCodes = getRelatedLanguageCodes(captionLanguageCode);
    videoQuery = Parse.Query.or(
      ...languageCodes.map((language) => {
        const query = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
        query.greaterThan(`captions.${language}`, 0);
        query
          .matches("name", title)
          .greaterThan("captionCount", 0)
          .descending("updatedAt");
        return query;
      })
    );
  } else if (captionLanguageCode && captionLanguageCode !== "any") {
    videoQuery
      .greaterThan(`captions.${captionLanguageCode}`, 0)
      .matches("name", title)
      .greaterThan("captionCount", 0)
      .descending("updatedAt");
  } else {
    videoQuery
      .matches("name", title)
      .greaterThan("captionCount", 0)
      .descending("updatedAt");
  }

  if (videoLanguageCode && videoLanguageCode !== "any") {
    if (!videoLanguageCode.includes("_")) {
      // Find all videos with sublanguage codes that match the given code
      const videoLanguageRegex = new RegExp(
        `^${escapeRegexInString(videoLanguageCode)}($|_+.*)`,
        "i"
      );
      videoQuery.matches("language", videoLanguageRegex);
    } else {
      videoQuery.equalTo("language", videoLanguageCode);
    }
  }
  return videoQuery;
};

export const getVideoByVideoIdQuery = (title: RegExp) => {
  let videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
  videoQuery
    .matches("sourceId", title)
    .greaterThan("captionCount", 0)
    .descending("updatedAt");
  return videoQuery;
};

export const getVideoByCaptionTitleQuery = async (
  title: RegExp,
  captionLanguageCode: string,
  videoLanguageCode: string
) => {
  let translatedVideoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
  const captionQuery = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
  if (captionLanguageCode && captionLanguageCode !== "any") {
    // We need to do a multi query with all the sub languages accounted for
    captionQuery
      .matches(
        "language",
        new RegExp(`^${escapeRegexInString(captionLanguageCode)}($|_+.*)`, "i")
      )
      .matches("translatedTitle", title);
  } else {
    captionQuery.matches("translatedTitle", title);
  }
  const videosWithCaptionNames = await captionQuery.map((caption) => {
    return {
      videoId: caption.get("videoId"),
      videoSource: caption.get("videoSource"),
    };
  });
  if (videosWithCaptionNames.length <= 0) {
    return undefined;
  }
  translatedVideoQuery = Parse.Query.or(
    ...videosWithCaptionNames.map((videoData) => {
      return new Parse.Query<VideoSchema>(PARSE_CLASS.videos)
        .matches("sourceId", videoData.videoId)
        .matches("source", videoData.videoSource);
    })
  );
  if (videoLanguageCode !== "any") {
    if (!videoLanguageCode.includes("_")) {
      // Find all videos with sublanguage codes that match the given code
      const videoLanguageRegex = new RegExp(
        `^${escapeRegexInString(videoLanguageCode)}($|_+.*)`,
        "i"
      );
      translatedVideoQuery.matches("language", videoLanguageRegex);
    } else {
      translatedVideoQuery.equalTo("language", videoLanguageCode);
    }
  }
  return translatedVideoQuery;
};
