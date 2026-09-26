import { compressToBase64 } from "lz-string";
import Parse from "parse/node";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
import { PARSE_CLASS } from "../../src/cloud/constants";
import {
  createCaptioner,
  createTestUser,
  createVideo,
  resetCollections,
} from "../helpers/fixtures";
import { TRANSPORTS, invokeApi } from "../helpers/invoke-api";
import {
  MongoUnavailableError,
  startParseServer,
  stopParseServer,
} from "../helpers/parse-test-server";

interface UploadResponse {
  status: "success" | "error";
  error?: string;
  captionId?: string;
}

const VIDEO_ID = "test-video-id";
// Youtube, which is what the in-website editor's source maps to
const VIDEO_SOURCE = 0;
const WEB_VIDEO_SOURCE = 9999;

const ASS_FILE = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello there
`;

const makeSubmitParams = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  caption: {
    videoId: VIDEO_ID,
    videoSource: WEB_VIDEO_SOURCE,
    loadedByUser: true,
    languageCode: "en",
    translatedTitle: "A translated title",
    userLike: null,
    userDislike: null,
    data: {
      tracks: [
        {
          cues: [{ start: 1000, end: 3000, text: "Hello there" }],
        },
      ],
    },
  },
  video: {
    id: VIDEO_ID,
    source: WEB_VIDEO_SOURCE,
    name: "A video",
    languageCode: "en",
  },
  hasAudioDescription: false,
  privacy: 0,
  ...overrides,
});

let skipReason: string | undefined;

const skipIfNoServer = (ctx: TestContext) => {
  if (skipReason) ctx.skip(skipReason);
};

const findCaptions = async (): Promise<Parse.Object<Parse.Attributes>[]> => {
  const query = new Parse.Query(PARSE_CLASS.captions);
  return query.find({ useMasterKey: true });
};

describe.each(TRANSPORTS)("submitCaption via %s", (transport) => {
  beforeAll(async () => {
    try {
      await startParseServer();
    } catch (err) {
      if (err instanceof MongoUnavailableError) {
        skipReason = err.message;
        console.warn(`[submitCaption.test] skipping: ${err.message}`);
        return;
      }
      throw err;
    }
  });

  afterAll(async () => {
    if (!skipReason) await stopParseServer();
  });

  beforeEach(async () => {
    if (skipReason) return;
    await resetCollections();
    await Parse.Config.save({ maintenance: false }, {});
  });

  const createSubmitter = async (username: string) => {
    const { user, sessionToken } = await createTestUser({ username });
    await createCaptioner({ userId: user.id as string, name: "Submitter" });
    // Pre-create the video so the cloud function doesn't reach out to the
    // oembed service for a video name
    await createVideo({ sourceId: VIDEO_ID, source: `${VIDEO_SOURCE}` });
    return { user, sessionToken };
  };

  it("succeeds for a caption without any raw caption", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken } = await createSubmitter("submitter-no-raw");

    const res = await invokeApi<UploadResponse>(
      transport,
      "submitCaption",
      makeSubmitParams(),
      { sessionToken },
    );

    expect(res.status).toBe("success");
    expect(res.captionId).toBeTruthy();
    expect(await findCaptions()).toHaveLength(1);
  });

  it("succeeds when the raw caption carries no data", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken } = await createSubmitter("submitter-empty-raw");

    // The web editor has no raw caption to send, so it used to send an empty
    // object. Storing that as a file fails with "Invalid file upload." after
    // the caption itself has already been saved
    const res = await invokeApi<UploadResponse>(
      transport,
      "submitCaption",
      makeSubmitParams({ rawCaption: {} }),
      { sessionToken },
    );

    expect(res).toEqual({
      status: "success",
      captionId: expect.any(String),
    });
    const captions = await findCaptions();
    expect(captions).toHaveLength(1);
    expect(captions[0].get("rawFile")).toBeUndefined();
  });

  it("succeeds when a non ass raw caption is submitted", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken } = await createSubmitter("submitter-srt-raw");

    // Raws are only stored for ass captions, so an srt raw caption has nothing
    // to upload
    const res = await invokeApi<UploadResponse>(
      transport,
      "submitCaption",
      makeSubmitParams({
        rawCaption: { type: "srt", data: compressToBase64("1\nsomething\n") },
      }),
      { sessionToken },
    );

    expect(res.status).toBe("success");
    const captions = await findCaptions();
    expect(captions).toHaveLength(1);
    expect(captions[0].get("rawFile")).toBeUndefined();
  });

  it("stores the raw file for an ass caption", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken } = await createSubmitter("submitter-ass-raw");

    const res = await invokeApi<UploadResponse>(
      transport,
      "submitCaption",
      makeSubmitParams({
        rawCaption: { type: "ass", data: compressToBase64(ASS_FILE) },
      }),
      { sessionToken },
    );

    expect(res.status).toBe("success");
    const captions = await findCaptions();
    expect(captions).toHaveLength(1);
    expect(captions[0].get("rawFile")).toBeTruthy();
    expect(JSON.parse(captions[0].get("rawContent"))).toEqual({
      type: "ass",
      data: "",
    });
  });

  it("rejects an invalid ass caption without leaving the caption behind", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken } = await createSubmitter("submitter-invalid-ass");

    const res = await invokeApi<UploadResponse>(
      transport,
      "submitCaption",
      makeSubmitParams({
        rawCaption: { type: "ass", data: compressToBase64("not an ass file") },
      }),
      { sessionToken },
    );

    expect(res).toEqual({ status: "error", error: "Invalid .ass/.ssa file" });
    expect(await findCaptions()).toHaveLength(0);
  });
});
