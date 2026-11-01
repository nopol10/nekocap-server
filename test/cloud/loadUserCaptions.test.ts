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
import {
  createCaption,
  createCaptioner,
  createTestUser,
  createVideo,
  resetCollections,
} from "../helpers/fixtures";
import { TRANSPORTS, type Transport, invokeApi } from "../helpers/invoke-api";
import {
  MongoUnavailableError,
  startParseServer,
  stopParseServer,
} from "../helpers/parse-test-server";

interface CaptionListItem {
  id: string;
  videoName: string;
  translatedTitle?: string;
}

interface CaptionsResponse {
  status: "success" | "error";
  error?: string;
  captions: CaptionListItem[];
  hasMore: boolean;
}

const VIDEO_SOURCE = "0";

let skipReason: string | undefined;

const skipIfNoServer = (ctx: TestContext) => {
  if (skipReason) ctx.skip(skipReason);
};

const loadUserCaptions = (
  transport: Transport,
  params: Record<string, unknown>,
) => invokeApi<CaptionsResponse>(transport, "loadUserCaptions", params);

const videoNames = (response: CaptionsResponse) =>
  response.captions.map((caption) => caption.videoName).sort();

describe.each(TRANSPORTS)("loadUserCaptions via %s", (transport) => {
  let captionerId: string;

  beforeAll(async () => {
    try {
      await startParseServer();
    } catch (err) {
      if (err instanceof MongoUnavailableError) {
        skipReason = err.message;
        console.warn(`[loadUserCaptions.test] skipping: ${err.message}`);
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

    const { user } = await createTestUser({ username: "capper" });
    captionerId = user.id as string;
    await createCaptioner({ userId: captionerId, name: "Capper" });

    // Matches on its original title only
    await createVideo({
      sourceId: "video-1",
      source: VIDEO_SOURCE,
      name: "Spy x Family Episode 1",
    });
    await createCaption({
      creatorId: captionerId,
      videoId: "video-1",
      videoSource: VIDEO_SOURCE,
      translatedTitle: "Familia espía",
    });

    // Matches on neither title
    await createVideo({
      sourceId: "video-2",
      source: VIDEO_SOURCE,
      name: "Frieren Episode 2",
    });
    await createCaption({
      creatorId: captionerId,
      videoId: "video-2",
      videoSource: VIDEO_SOURCE,
      translatedTitle: "Frieren traducido",
    });

    // Matches on its translated title only
    await createVideo({
      sourceId: "video-3",
      source: VIDEO_SOURCE,
      name: "Another Show",
    });
    await createCaption({
      creatorId: captionerId,
      videoId: "video-3",
      videoSource: VIDEO_SOURCE,
      translatedTitle: "A spy story",
    });
  });

  it("returns every caption when no title filter is given", async (ctx) => {
    skipIfNoServer(ctx);

    const response = await loadUserCaptions(transport, {
      captionerId,
      limit: 20,
    });

    expect(response.status).toBe("success");
    expect(videoNames(response)).toEqual([
      "Another Show",
      "Frieren Episode 2",
      "Spy x Family Episode 1",
    ]);
  });

  it("keeps captions matching either the original or the translated title", async (ctx) => {
    skipIfNoServer(ctx);

    const response = await loadUserCaptions(transport, {
      captionerId,
      limit: 20,
      titleFilter: "spy",
    });

    expect(response.status).toBe("success");
    expect(videoNames(response)).toEqual([
      "Another Show",
      "Spy x Family Episode 1",
    ]);
  });

  it("matches the title regardless of case", async (ctx) => {
    skipIfNoServer(ctx);

    const response = await loadUserCaptions(transport, {
      captionerId,
      limit: 20,
      titleFilter: "FRIEREN",
    });

    expect(videoNames(response)).toEqual(["Frieren Episode 2"]);
  });

  it("treats regex characters in the filter as text", async (ctx) => {
    skipIfNoServer(ctx);

    const response = await loadUserCaptions(transport, {
      captionerId,
      limit: 20,
      titleFilter: "spy.*family",
    });

    expect(response.status).toBe("success");
    expect(response.captions).toHaveLength(0);
  });

  it("ignores a filter that is only whitespace", async (ctx) => {
    skipIfNoServer(ctx);

    const response = await loadUserCaptions(transport, {
      captionerId,
      limit: 20,
      titleFilter: "   ",
    });

    expect(response.captions).toHaveLength(3);
  });

  it("paginates the filtered captions", async (ctx) => {
    skipIfNoServer(ctx);

    const firstPage = await loadUserCaptions(transport, {
      captionerId,
      limit: 1,
      offset: 0,
      titleFilter: "spy",
    });
    expect(firstPage.captions).toHaveLength(1);
    expect(firstPage.hasMore).toBe(true);

    const secondPage = await loadUserCaptions(transport, {
      captionerId,
      limit: 1,
      offset: 1,
      titleFilter: "spy",
    });
    expect(secondPage.captions).toHaveLength(1);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.captions[0].id).not.toBe(firstPage.captions[0].id);
  });
});
