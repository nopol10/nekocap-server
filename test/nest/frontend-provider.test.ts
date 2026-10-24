import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// The frontend's API client, driven against this server to make sure the two
// agree on the REST contract
import { LoginMethod } from "../../../nekocap/src/common/providers/backend-provider";
import { createNestJsProvider } from "../../../nekocap/src/common/providers/nestjs/nestjs-provider";
import { rawCollection } from "../helpers/mongo";
import { getTestServer } from "../helpers/parse-test-server";
import { validAuthData } from "../helpers/test-identity-provider";
import { useTestServer } from "../helpers/use-test-server";

const VIDEO_ID = "frontend-video";

/**
 * Stands in for the ParseProvider that keeps the logged in user's session
 */
const createSessionStore = () => {
  let sessionToken: string | undefined;
  return {
    getSessionToken: async () => sessionToken,
    become: async (token: string) => {
      sessionToken = token;
    },
    logout: async () => {
      sessionToken = undefined;
    },
  };
};

describe("nekocap's NestJsProvider against the server", () => {
  const { skipIfNoServer } = useTestServer("frontend-provider.test");

  beforeEach(() => {
    const apiURL = getTestServer().apiURL;
    vi.stubEnv(
      "NEXT_PUBLIC_NEKOCAP_API_URL",
      apiURL.substring(0, apiURL.length - "/api/v1".length),
    );
    // Act as a browser client so that the session token is sent
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("logs in, manages a profile and captions", async (ctx) => {
    skipIfNoServer(ctx);
    const sessions = createSessionStore();
    const provider = createNestJsProvider(sessions as never);
    await rawCollection("videos").insertOne({
      _id: "frontvid01",
      sourceId: VIDEO_ID,
      source: "0",
      name: "Frontend video",
      language: "en",
      captions: {},
      captionCount: 0,
      _created_at: new Date(),
      _updated_at: new Date(),
    } as never);

    const userData = await provider.completeDeferredLogin(
      LoginMethod.Firebase,
      { id: "frontend-uid", username: "Frontend" },
      validAuthData("frontend-uid"),
    );
    expect(userData.isNewUser).toBe(true);
    expect(await sessions.getSessionToken()).toBe(userData.sessionToken);

    const profile = await provider.updateCaptionerProfile({
      name: "Frontend",
      languageCodes: ["en"],
    });
    const userId = profile.captioner!.userId;
    expect(profile.captioner).toMatchObject({ name: "Frontend" });
    expect(profile.privateProfile).toMatchObject({ isAdmin: false });

    const submitted = await provider.submitCaption({
      caption: {
        videoId: VIDEO_ID,
        videoSource: 0,
        languageCode: "en",
        translatedTitle: "Translated",
        data: { tracks: [{ cues: [] }] },
      } as never,
      video: { name: "Frontend video", languageCode: "en" } as never,
      hasAudioDescription: true,
    });
    expect(submitted.status).toBe("success");
    const captionId = submitted.captionId!;

    const listed = await provider.loadCaptions({
      videoId: VIDEO_ID,
      videoSource: 0,
    });
    expect(listed).toEqual([
      expect.objectContaining({ id: captionId, captionerName: "Frontend" }),
    ]);

    const loaded = await provider.loadCaption({ captionId });
    expect(loaded.caption).toMatchObject({
      id: captionId,
      videoId: VIDEO_ID,
      videoSource: 0,
      translatedTitle: "Translated",
      originalTitle: "Frontend video",
      creator: userId,
      creatorName: "Frontend",
      languageCode: "en",
      tags: ["audioDescribed"],
      data: { tracks: [{ cues: [] }] },
    });
    expect(loaded.rawCaption).toBeNull();

    expect(
      await provider.updateCaption({
        captionId,
        selectedTags: ["g:Group:#123456"],
        hasAudioDescription: true,
      }),
    ).toEqual({ status: "success" });
    expect(await provider.getOwnProfileTags()).toEqual({
      status: "success",
      tags: [{ tag: "g:Group:#123456", count: 1 }],
    });

    const ownCaptions = await provider.loadUserCaptions({
      captionerId: userId,
      tags: ["g:Group:#123456"],
    });
    expect(ownCaptions.captions.map((caption) => caption.id)).toEqual([
      captionId,
    ]);
    const privateData = await provider.loadPrivateCaptionerData({});
    expect(privateData.captions).toHaveLength(1);
    const publicProfile = await provider.loadProfile({ profileId: userId });
    expect(publicProfile.captioner).toMatchObject({ name: "Frontend" });

    expect((await provider.loadLatestCaptions()).captions).toHaveLength(1);
    expect(
      (await provider.loadLatestUserLanguageCaptions("en")).captions,
    ).toHaveLength(1);
    expect(await provider.browse({ limit: 10, offset: 0 })).toMatchObject({
      status: "success",
      totalCount: 1,
    });
    expect(
      (await provider.search({ title: "frontend", limit: 10 })).videos,
    ).toEqual([
      expect.objectContaining({ sourceId: VIDEO_ID, captionCount: 1 }),
    ]);
    expect((await provider.getGlobalStats()).result).toMatchObject({
      totalCaptions: 1,
    });
    expect(
      await provider.getAutoCaptionList({ videoId: VIDEO_ID, videoSource: 0 }),
    ).toEqual({ status: "success", captions: [] });

    // Liking your own caption is refused
    expect(await provider.likeCaption({ captionId })).toEqual({
      status: "error",
      error: "Can't like your own caption!",
    });
    // Not a reviewer
    await expect(provider.loadCaptionForReview({ captionId })).rejects.toThrow(
      "Not authorized",
    );

    expect(await provider.deleteProfileTag({ tagName: "Group" })).toEqual({
      status: "success",
    });
    expect(await provider.deleteCaption(captionId)).toEqual({
      status: "success",
    });
    expect(await rawCollection("captions").countDocuments({})).toBe(0);
  });

  it("rejects requests that need a login without a session", async (ctx) => {
    skipIfNoServer(ctx);
    const provider = createNestJsProvider(createSessionStore() as never);
    await expect(provider.loadPrivateCaptionerData({})).rejects.toThrow(
      "Not authorized! Please login",
    );
  });
});
