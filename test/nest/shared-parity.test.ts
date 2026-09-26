import { describe, expect, it } from "vitest";
import {
  CaptionPrivacy as FrontendCaptionPrivacy,
  VideoSource as FrontendVideoSource,
  WebSourceToVideoSourceMap as FrontendWebSourceMap,
} from "../../../nekocap/src/common/feature/video/types";
import {
  getCaptionGroupTagColor as frontendTagColor,
  getCaptionGroupTagName as frontendTagName,
  videoSourceToProcessorMap,
} from "../../../nekocap/src/common/feature/video/utils";
import {
  getCaptionGroupTagColor,
  getCaptionGroupTagName,
} from "../../src/nest/shared/caption-tags";
import {
  CaptionPrivacy,
  VIDEO_LINK_GENERATORS,
  VideoSource,
  WebSourceToVideoSourceMap,
} from "../../src/nest/shared/video-source";

// The NestJS app can't import these from nekocap as the modules depend on
// frontend-only packages, so it keeps copies that must stay in sync.
describe("values mirrored from the frontend", () => {
  it("has the same video sources", () => {
    expect(VideoSource).toEqual(FrontendVideoSource);
    expect(WebSourceToVideoSourceMap).toEqual(FrontendWebSourceMap);
    expect(CaptionPrivacy).toEqual(FrontendCaptionPrivacy);
  });

  it("generates the same video links as the processors", () => {
    const videoIds = ["abc123", "user/12345", "BV1xx|2"];
    for (const [source, processor] of Object.entries(
      videoSourceToProcessorMap,
    )) {
      const generate = VIDEO_LINK_GENERATORS[Number(source)];
      expect(generate, `link generator for source ${source}`).toBeDefined();
      for (const videoId of videoIds) {
        expect(generate(videoId)).toBe(processor.generateVideoLink(videoId));
      }
    }
  });

  it("parses group tags the same way", () => {
    for (const tag of ["g:Name:#fff", "g::#fff", "plain", "g:a:b:c"]) {
      expect(getCaptionGroupTagName(tag)).toBe(frontendTagName(tag));
      expect(getCaptionGroupTagColor(tag)).toBe(frontendTagColor(tag));
    }
  });
});
