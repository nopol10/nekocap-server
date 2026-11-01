// Mirrors VideoSource, WebSourceToVideoSourceMap and CaptionPrivacy in
// nekocap's src/common/feature/video/types.ts. That file cannot be imported
// here as it depends on frontend-only packages.
// test/nest/shared-parity.test.ts keeps these in sync with the frontend.

export enum VideoSource {
  Youtube = 0,
  TVer = 1,
  Vimeo = 2,
  NicoNico = 3,
  Bilibili = 4,
  BilibiliBangumi = 5,
  Netflix = 6,
  AmazonPrime = 7,
  Twitter = 8,
  Wetv = 9,
  TikTok = 10,
  iQiyi = 11,
  NogiDoga = 12,
  Abema = 13,
  Dailymotion = 14,
  BilibiliTV = 15,
  ArchiveOrg = 16,
  TBSFree = 17,
  Instagram = 18,
  UNEXT = 19,
  Lemino = 20,
  OneD = 21,
  // In-website editor sources
  NekoCapYoutube = 9999,
}

export const WebSourceToVideoSourceMap: Partial<
  Record<VideoSource, VideoSource>
> = {
  [VideoSource.NekoCapYoutube]: VideoSource.Youtube,
};

export enum CaptionPrivacy {
  Public = 0,
  Unlisted = 1,
}

const splitJoin = (videoId: string, separator: string) =>
  videoId.split(separator).join("?p=");

/**
 * Mirrors each processor's `generateVideoLink` in nekocap's
 * src/extension/content/processors
 */
export const VIDEO_LINK_GENERATORS: Record<
  number,
  (videoId: string) => string
> = {
  [VideoSource.Youtube]: (id) => `https://www.youtube.com/watch?v=${id}`,
  [VideoSource.TVer]: (id) => `https://tver.jp/${id}`,
  [VideoSource.Vimeo]: (id) => `https://vimeo.com/${id}`,
  [VideoSource.NicoNico]: (id) => `https://www.nicovideo.jp/watch/${id}`,
  [VideoSource.Bilibili]: (id) =>
    `https://www.bilibili.com/video/${splitJoin(id, "|")}`,
  [VideoSource.BilibiliBangumi]: (id) =>
    `https://www.bilibili.com/bangumi/${id}`,
  [VideoSource.Netflix]: (id) => `https://www.netflix.com/watch/${id}`,
  [VideoSource.AmazonPrime]: (id) =>
    `https://www.primevideo.com/detail/${id.split("|")[0]}`,
  [VideoSource.Twitter]: (id) => `https://twitter.com/i/web/status/${id}`,
  [VideoSource.Wetv]: (id) => `https://wetv.vip/play/${splitJoin(id, "/")}`,
  [VideoSource.TikTok]: (id) =>
    `https://www.tiktok.com/@${id.split("/")[0]}/video/${id.split("/")[1]}`,
  [VideoSource.iQiyi]: (id) => `https://www.iq.com/play/${id}`,
  [VideoSource.NogiDoga]: (id) => `https://nogidoga.com/episode/${id}`,
  [VideoSource.Abema]: (id) => `https://abema.tv/${id}`,
  [VideoSource.Dailymotion]: (id) => `https://www.dailymotion.com/video/${id}`,
  [VideoSource.BilibiliTV]: (id) => `https://www.bilibili.tv/en/${id}`,
  [VideoSource.ArchiveOrg]: (id) => `https://archive.org/details/${id}`,
  [VideoSource.TBSFree]: (id) => `https://cu.tbs.co.jp/episode/${id}`,
  [VideoSource.Instagram]: (id) => `https://instagram.com/p/${id}`,
  [VideoSource.UNEXT]: (id) => `https://video.unext.jp/play/${id}`,
  [VideoSource.Lemino]: (id) => `https://lemino.docomo.ne.jp/?crid=${id}`,
  [VideoSource.OneD]: (id) => `https://www.oned.net/video/${id}`,
  [VideoSource.NekoCapYoutube]: (id) => `https://www.youtube.com/watch?v=${id}`,
};
