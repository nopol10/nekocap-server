export const SINGLETON_ID = "homepage";

export const HOMEPAGE_STATS_COLLECTION = "homepageStats";

export const CAPTIONS_COLLECTION = "captions";

export const VIDEOS_COLLECTION = "videos";

export const CAPTIONER_COLLECTION = "captioner";

// Mirrors the entries of videoSourceToProcessorMap in nekocap's
// src/common/feature/video/utils.ts. NekoCapYoutube is a YouTube
// subset (see VIDEO_SOURCE_MIGRATION_MAP) so we exclude it from the
// "supported sites" count shown on the homepage.
export const TOTAL_SUPPORTED_SITES = 22;

export const NEST_API_PREFIX = "/api/v1";

export const floorTo = (value: number, step: number): number =>
  Math.floor(value / step) * step;
