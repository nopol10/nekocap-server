import { compressToBase64 } from "lz-string";
import Parse from "parse/node";
import { describe, expect, it } from "vitest";
import {
  addUserToRole,
  createCaptioner,
  createTestUser,
  ensureRole,
  makeUserAdmin,
} from "../helpers/fixtures";
import { TRANSPORTS, invokeApi } from "../helpers/invoke-api";
import { rawCollection } from "../helpers/mongo";
import { useTestServer } from "../helpers/use-test-server";

type Response = Record<string, any>;

const VIDEO_ID = "lifecycle-video";
const YOUTUBE = 0;

const ASS_FILE = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello there
`;

const submitParams = (overrides: Record<string, unknown> = {}) => ({
  caption: {
    videoId: VIDEO_ID,
    videoSource: YOUTUBE,
    languageCode: "en",
    translatedTitle: "Lifecycle title",
    data: { tracks: [{ cues: [{ start: 0, end: 1000, text: "Hi" }] }] },
  },
  video: { name: "Lifecycle video", languageCode: "ja" },
  hasAudioDescription: false,
  privacy: 0,
  ...overrides,
});

/**
 * Parse cloud functions return Parse objects for captions whereas the REST
 * API returns their JSON form
 */
const field = (caption: any, key: string) =>
  typeof caption?.get === "function" ? caption.get(key) : caption?.[key];

const captionId = (caption: any) => caption?.id ?? caption?.objectId;

describe.each(TRANSPORTS)("caption lifecycle via %s", (transport) => {
  const { skipIfNoServer } = useTestServer(`caption-lifecycle.${transport}`);

  const call = (
    name: string,
    params: Record<string, unknown> = {},
    sessionToken?: string,
  ) => invokeApi<Response>(transport, name, params, { sessionToken });

  const createCaptionerUser = async (username: string) => {
    const testUser = await createTestUser({ username });
    // Verified captioners skip the submission cooldown
    await createCaptioner({
      userId: testUser.user.id as string,
      name: username,
      verified: true,
    });
    return testUser;
  };

  const seedVideo = () =>
    rawCollection("videos").insertOne({
      _id: "vid0000001",
      sourceId: VIDEO_ID,
      source: `${YOUTUBE}`,
      name: "Lifecycle video",
      language: "ja",
      captions: {},
      captionCount: 0,
      _created_at: new Date(),
      _updated_at: new Date(),
    } as never);

  const getVideo = () =>
    rawCollection("videos").findOne({ sourceId: VIDEO_ID });

  const getCaptioner = (userId: string) =>
    rawCollection("captioner").findOne({ userId });

  it("submits, loads, updates and deletes a caption, keeping counts in sync", async (ctx) => {
    skipIfNoServer(ctx);
    await seedVideo();
    const { user, sessionToken } = await createCaptionerUser("creator");
    const viewer = await createTestUser({ username: "viewer" });

    const submitted = await call("submitCaption", submitParams(), sessionToken);
    expect(submitted.status).toBe("success");
    const id = submitted.captionId as string;

    // Stored in Parse's format, readable through Parse
    const parseCaption = await new Parse.Query("captions").get(id, {
      useMasterKey: true,
    });
    expect(parseCaption.get("creatorId")).toBe(user.id);
    expect(parseCaption.get("videoSource")).toBe("0");
    expect(parseCaption.getACL()?.getPublicReadAccess()).toBe(true);
    expect(parseCaption.getACL()?.getRoleWriteAccess("reviewer")).toBe(true);
    expect(parseCaption.getACL()?.getWriteAccess(user.id as string)).toBe(
      false,
    );

    expect(await getVideo()).toMatchObject({
      captionCount: 1,
      captions: { en: 1 },
    });
    expect(await getCaptioner(user.id as string)).toMatchObject({
      captionCount: 1,
    });

    // Listed for the video
    const listed = await call("findCaptions", {
      videoId: VIDEO_ID,
      videoSource: YOUTUBE,
    });
    expect(listed).toEqual([
      expect.objectContaining({
        id,
        captionerId: user.id,
        captionerName: "creator",
        languageCode: "en",
        advanced: false,
      }),
    ]);

    // Loading counts as a view
    const loaded = await call("loadCaption", { captionId: id });
    expect(loaded.status).toBe("success");
    expect(captionId(loaded.caption)).toBe(id);
    expect(field(loaded.caption, "videoId")).toBe(VIDEO_ID);
    expect(JSON.parse(field(loaded.caption, "content"))).toEqual(
      submitParams().caption.data,
    );
    expect(loaded.originalTitle).toBe("Lifecycle video");
    expect(loaded.captionerName).toBe("creator");
    expect(loaded.rawCaptionUrl).toBe("");
    expect(
      (await rawCollection("captions").findOne({ _id: id as never }))?.views,
    ).toBe(1);

    // Making it unlisted hides it from others and removes it from the counts
    const updated = await call(
      "updateCaption",
      { captionId: id, privacy: 1, translatedTitle: "New title" },
      sessionToken,
    );
    expect(updated).toEqual({ status: "success" });
    expect(await getVideo()).toMatchObject({
      captionCount: 0,
      captions: { en: 0 },
    });
    expect(
      await call(
        "findCaptions",
        { videoId: VIDEO_ID, videoSource: YOUTUBE },
        viewer.sessionToken,
      ),
    ).toEqual([]);
    expect(
      await call(
        "findCaptions",
        { videoId: VIDEO_ID, videoSource: YOUTUBE },
        sessionToken,
      ),
    ).toHaveLength(1);

    // Only the creator can update it
    expect(
      await call(
        "updateCaption",
        { captionId: id, privacy: 0 },
        viewer.sessionToken,
      ),
    ).toEqual({ status: "error", error: "No such caption" });

    // Others can't delete it
    expect(
      await call("deleteCaption", { captionId: id }, viewer.sessionToken),
    ).toEqual({ status: "error", error: "Not authorized!" });

    const deleted = await call(
      "deleteCaption",
      { captionId: id },
      sessionToken,
    );
    expect(deleted).toEqual({ status: "success" });
    expect(await rawCollection("captions").countDocuments({})).toBe(0);
    expect(await getCaptioner(user.id as string)).toMatchObject({
      captionCount: 0,
    });
    // It was unlisted so the video counts were already excluding it
    expect(await getVideo()).toMatchObject({ captionCount: 0, captions: {} });
  });

  it("stores advanced captions' raw files where Parse serves them", async (ctx) => {
    skipIfNoServer(ctx);
    await seedVideo();
    const { sessionToken } = await createCaptionerUser("ass-creator");
    const rawData = compressToBase64(ASS_FILE);

    const submitted = await call(
      "submitCaption",
      submitParams({ rawCaption: { type: "ass", data: rawData } }),
      sessionToken,
    );
    expect(submitted.status).toBe("success");

    const loaded = await call("loadCaption", {
      captionId: submitted.captionId,
    });
    expect(JSON.parse(loaded.rawCaption)).toEqual({ type: "ass", data: "" });
    expect(loaded.rawCaptionUrl).toMatch(
      /\/parse\/files\/nekocap-test-app\/[0-9a-f]{32}_.+\.txt$/,
    );
    // Parse serves the file, with the same bytes the client uploaded
    const fileResponse = await fetch(loaded.rawCaptionUrl);
    expect(fileResponse.ok).toBe(true);
    const fileData = Buffer.from(await fileResponse.arrayBuffer());
    expect(fileData.toString("base64")).toBe(
      Buffer.from(rawData, "base64").toString("base64"),
    );
    // The caption's rawFile is a Parse file
    const rawFile = field(loaded.caption, "rawFile");
    const rawFileName =
      typeof rawFile?.name === "function" ? rawFile.name() : rawFile?.name;
    expect(loaded.rawCaptionUrl).toContain(rawFileName);

    // Replacing the raw caption with plain caption data removes the file
    const updated = await call(
      "updateCaption",
      {
        captionId: submitted.captionId,
        captionData: { tracks: [] },
      },
      sessionToken,
    );
    expect(updated).toEqual({ status: "success" });
    expect((await fetch(loaded.rawCaptionUrl)).ok).toBe(false);
    expect(await rawCollection("fs.files").countDocuments({})).toBe(0);
  });

  it("toggles likes and dislikes", async (ctx) => {
    skipIfNoServer(ctx);
    await seedVideo();
    const creator = await createCaptionerUser("liked-creator");
    const fan = await createTestUser({ username: "fan" });
    const { captionId: id } = await call(
      "submitCaption",
      submitParams(),
      creator.sessionToken,
    );
    const counts = async () => {
      const caption = await rawCollection("captions").findOne({
        _id: id as never,
      });
      return { likes: caption?.likes, dislikes: caption?.dislikes };
    };

    expect(
      await call("likeCaption", { captionId: id }, creator.sessionToken),
    ).toEqual({ status: "error", error: "Can't like your own caption!" });

    expect(
      await call("likeCaption", { captionId: id }, fan.sessionToken),
    ).toEqual({ status: "success" });
    expect(await counts()).toEqual({ likes: 1, dislikes: undefined });
    const liked = await call(
      "loadCaption",
      { captionId: id },
      fan.sessionToken,
    );
    expect(liked.userLike).toBe(true);
    expect(liked.userDislike).toBe(false);

    await call("dislikeCaption", { captionId: id }, fan.sessionToken);
    expect(await counts()).toEqual({ likes: 0, dislikes: 1 });

    await call("dislikeCaption", { captionId: id }, fan.sessionToken);
    expect(await counts()).toEqual({ likes: 0, dislikes: 0 });

    const likesDoc = await rawCollection("captionLikes").findOne({
      userId: fan.user.id,
    });
    expect(likesDoc).toMatchObject({
      likes: [],
      dislikes: [],
      _rperm: ["role:admin"],
    });
  });

  it("lets reviewers verify and reject captions", async (ctx) => {
    skipIfNoServer(ctx);
    await seedVideo();
    const creator = await createCaptionerUser("reviewed-creator");
    const reviewer = await createCaptionerUser("the-reviewer");
    await addUserToRole(reviewer.user, "reviewer");
    const { captionId: id } = await call(
      "submitCaption",
      submitParams(),
      creator.sessionToken,
    );

    expect(
      await call("verifyCaption", { captionId: id }, creator.sessionToken),
    ).toEqual({ status: "error", error: "Not authorized!" });
    expect(
      await call(
        "loadCaptionForReview",
        { captionId: id },
        creator.sessionToken,
      ),
    ).toEqual({ status: "error", error: "Not authorized" });

    await call("verifyCaption", { captionId: id }, reviewer.sessionToken);
    await call(
      "rejectCaption",
      { captionId: id, reason: "Spam" },
      reviewer.sessionToken,
    );

    const review = await call(
      "loadCaptionForReview",
      { captionId: id },
      reviewer.sessionToken,
    );
    expect(review.status).toBe("success");
    expect(review.videoName).toBe("Lifecycle video");
    expect(review.captioner).toMatchObject({ name: "reviewed-creator" });
    expect(field(review.caption, "verified")).toBe(false);
    expect(field(review.caption, "rejected")).toBe(true);
    expect(field(review.caption, "reviewHistory")).toEqual([
      expect.objectContaining({
        reviewerId: reviewer.user.id,
        reviewerName: "the-reviewer",
        newState: "verified",
      }),
      expect.objectContaining({ newState: "rejected", reason: "Spam" }),
    ]);
    // Rejected captions aren't listed
    expect(
      await call("findCaptions", { videoId: VIDEO_ID, videoSource: YOUTUBE }),
    ).toEqual([]);
  });

  it("manages captioner profiles, roles and tags", async (ctx) => {
    skipIfNoServer(ctx);
    await seedVideo();
    const admin = await createCaptionerUser("admin");
    await makeUserAdmin(admin.user);
    await ensureRole("reviewer");
    const newbie = await createTestUser({ username: "newbie" });
    const newbieId = newbie.user.id as string;

    // Profile set up for a user that has no name yet
    const profile = await call(
      "updateCaptionerProfile",
      { name: "Newbie", languageCodes: ["en", "ja"], profileMessage: "Hi" },
      newbie.sessionToken,
    );
    expect(profile.status).toBe("success");
    expect(profile.captioner).toMatchObject({
      name: "Newbie",
      languageCodes: ["en", "ja"],
      profileMessage: "Hi",
      isAdmin: false,
    });
    expect(profile.captioner.nameTag).toBeLessThanOrEqual(9999);
    expect(profile.privateProfile).toEqual({
      isAdmin: false,
      isReviewer: false,
      isReviewerManager: false,
    });

    // Admin actions
    expect(
      await call(
        "verifyCaptioner",
        { targetUserId: newbieId },
        newbie.sessionToken,
      ),
    ).toEqual({ status: "error", error: "Not authorized!" });
    await call(
      "verifyCaptioner",
      { targetUserId: newbieId },
      admin.sessionToken,
    );
    await call(
      "assignReviewerRole",
      { targetUserId: newbieId },
      admin.sessionToken,
    );
    const privateData = await call(
      "loadPrivateCaptionerData",
      { withCaptions: true },
      newbie.sessionToken,
    );
    expect(privateData.captioner).toMatchObject({
      verified: true,
      isReviewer: true,
    });
    expect(privateData.privateProfile.isReviewer).toBe(true);
    // The role membership is visible to Parse
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo("name", "reviewer");
    roleQuery.equalTo("users", newbie.user);
    expect(await roleQuery.first({ useMasterKey: true })).toBeTruthy();
    // Toggles back
    await call(
      "assignReviewerRole",
      { targetUserId: newbieId },
      admin.sessionToken,
    );
    expect(
      (await call("loadProfile", { profileId: newbieId })).captioner.isReviewer,
    ).toBe(false);

    // Tags
    const { captionId: id } = await call(
      "submitCaption",
      submitParams(),
      newbie.sessionToken,
    );
    await call(
      "updateCaption",
      {
        captionId: id,
        hasAudioDescription: true,
        selectedTags: ["g:Series A:#ff0000", "not-a-group-tag"],
      },
      newbie.sessionToken,
    );
    const tagged = await rawCollection("captions").findOne({
      _id: id as never,
    });
    expect(tagged?.tags).toEqual(["audioDescribed", "g:Series A:#ff0000"]);
    expect(await call("getOwnProfileTags", {}, newbie.sessionToken)).toEqual({
      status: "success",
      tags: [{ tag: "g:Series A:#ff0000", count: 1 }],
    });
    const byTag = await call(
      "loadUserCaptions",
      { captionerId: newbieId, tags: ["g:Series A:#ff0000"] },
      newbie.sessionToken,
    );
    expect(byTag.captions.map((caption: Response) => caption.id)).toEqual([id]);

    expect(
      await call(
        "deleteProfileTag",
        { tagName: "Series A" },
        newbie.sessionToken,
      ),
    ).toEqual({ status: "success" });
    expect(
      (await rawCollection("captions").findOne({ _id: id as never }))?.tags,
    ).toEqual(["audioDescribed"]);
    expect((await getCaptioner(newbieId))?.captionTags).toEqual([]);

    // Banned captioners can't submit
    await call("banCaptioner", { targetUserId: newbieId }, admin.sessionToken);
    expect(
      await call("submitCaption", submitParams(), newbie.sessionToken),
    ).toEqual({ status: "error", error: "Not authorized! You are banned!" });
  });

  it("serves the public listings", async (ctx) => {
    skipIfNoServer(ctx);
    await seedVideo();
    const creator = await createCaptionerUser("lister");
    const fan = await createTestUser({ username: "lister-fan" });
    const { captionId: id } = await call(
      "submitCaption",
      submitParams(),
      creator.sessionToken,
    );
    await call("likeCaption", { captionId: id }, fan.sessionToken);

    const latest = await call("loadLatestCaptions");
    expect(latest.status).toBe("success");
    expect(latest.captions).toEqual([
      expect.objectContaining({
        id,
        creatorName: "lister",
        videoName: "Lifecycle video",
        videoLanguage: "ja",
        likes: 1,
      }),
    ]);
    expect(
      (await call("loadLatestLanguageCaptions", { languageCode: "en_US" }))
        .captions,
    ).toHaveLength(1);
    expect(
      (await call("loadLatestLanguageCaptions", { languageCode: "ja" }))
        .captions,
    ).toHaveLength(0);
    expect((await call("loadPopularCaptions")).captions).toHaveLength(1);

    const browse = await call("browse", { limit: 10, offset: 0 });
    expect(browse).toMatchObject({
      status: "success",
      hasMoreResults: false,
      totalCount: 1,
    });
    // Past the last page returns the last page
    const overshot = await call("browse", { limit: 10, offset: 50 });
    expect(overshot.captions).toHaveLength(1);

    const stats = await call("globalStats");
    expect(stats.result).toMatchObject({
      totalCaptions: 1,
      totalCaptionsPerLanguage: [{ languageCode: "en", count: 1 }],
    });

    const search = await call("search", { title: "lifecycle", limit: 10 });
    expect(search.status).toBe("success");
    expect(search.videos).toHaveLength(1);
    const video = search.videos[0];
    const videoJson =
      typeof video.toJSON === "function" ? video.toJSON() : video;
    expect(videoJson).toMatchObject({
      sourceId: VIDEO_ID,
      source: "0",
      name: "Lifecycle video",
    });

    expect(
      await call("getAutoCaptionList", { videoId: VIDEO_ID, videoSource: 0 }),
    ).toEqual({ status: "success", captions: [] });
  });

  it("blocks writes in maintenance mode", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken } = await createCaptionerUser("maintained");
    await Parse.Config.save({ maintenance: true });
    expect(await call("submitCaption", submitParams(), sessionToken)).toEqual({
      status: "error",
      error: "Sorry, we are in maintenance mode. Please try again later.",
    });
  });
});
