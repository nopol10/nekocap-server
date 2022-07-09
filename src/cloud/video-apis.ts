import { VideoSource } from "@/common/feature/video/types";
import {
  GetAutoCaptionListParams,
  GetAutoCaptionListResponse,
  AutoCaptionLanguage,
} from "@/common/feature/caption-editor/types";
import { baseLanguages, languages } from "@/common/languages";
import youtubedl, { YtResponse } from "youtube-dl-exec";
import { allowAutoCaptioning } from "./config";

type YtCaptionList = { [languageCode: string]: { ext: string; url: string }[] };

type YtResponseWithCaptions = {
  automatic_captions: YtCaptionList;
  subtitles: YtCaptionList;
} & YtResponse;

const convertYoutubeCaptionListToNekoCapList = (
  captionList: YtCaptionList,
  suffix: string = "",
  isAutomaticCaption: boolean = false
) => {
  return Object.keys(captionList)
    .map((language: keyof typeof languages) => {
      const item = captionList[language].find(
        (captionType) => captionType.ext === "srv1"
      );
      language = language.replace("-", "_").trim() as keyof typeof languages;
      if (!languages[language] && !baseLanguages[language]) {
        return null;
      }
      return {
        id: item.url,
        language: language,
        name: (languages[language] || baseLanguages[language]) + suffix,
        isAutomaticCaption,
      };
    })
    .filter(Boolean);
};

Parse.Cloud.define(
  "getAutoCaptionList",
  async (
    request: Parse.Cloud.FunctionRequest<GetAutoCaptionListParams>
  ): Promise<GetAutoCaptionListResponse> => {
    const { videoId, videoSource } = request.params;
    if (videoSource !== VideoSource.Youtube) {
      console.log("[getAutoCaptionList] Not youtube");
      return { captions: [], status: "error" };
    }
    // Temporarily disable auto captioning until cpu usage issue is resolved
    if (!(await allowAutoCaptioning())) {
      return { captions: [], status: "success" };
    }

    const youtubeDataResponse = (await youtubedl(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
        referer: `https://www.youtube.com/watch?v=${videoId}`,
      }
    )) as YtResponseWithCaptions;
    let captions: AutoCaptionLanguage[] = [];
    const { automatic_captions, subtitles } = youtubeDataResponse;
    if (automatic_captions && Object.keys(automatic_captions).length > 0) {
      captions = [
        ...captions,
        ...convertYoutubeCaptionListToNekoCapList(
          automatic_captions,
          " (Auto)",
          true
        ),
      ];
    }
    if (subtitles && Object.keys(subtitles).length > 0) {
      captions = [
        ...captions,
        ...convertYoutubeCaptionListToNekoCapList(subtitles, "", false),
      ];
    }
    captions.sort((captionA, captionB) =>
      captionA.name.localeCompare(captionB.name)
    );

    return { captions: captions, status: "success" };
  }
);
