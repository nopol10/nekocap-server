import Parse from "parse/node";
import { describe, expect, it } from "vitest";
import { CLOUD_FUNCTIONS } from "../../src/cloud/cloud-functions";
import { CloudBridgeService } from "../../src/nest/legacy/cloud-bridge.service";
import { invokeRest } from "../helpers/invoke-rest";
import { rawCollection } from "../helpers/mongo";
import { getTestServer } from "../helpers/parse-test-server";
import { useTestServer } from "../helpers/use-test-server";

describe("legacy Parse bridge", () => {
  const { skipIfNoServer } = useTestServer("legacy-bridge.test");

  it("backs every Parse cloud function with a NestJS handler", (ctx) => {
    skipIfNoServer(ctx);
    const bridge = getTestServer().nestApp.get(CloudBridgeService);
    const handlers = bridge.functionNames();
    for (const name of CLOUD_FUNCTIONS) {
      expect(handlers).toContain(name);
    }
    // The only handler without a cloud function is the _User hook's
    expect(handlers.filter((name) => !CLOUD_FUNCTIONS.includes(name))).toEqual([
      "ensureCaptionerRecords",
    ]);
  });

  it("creates captioner records for users signing up through Parse", async (ctx) => {
    skipIfNoServer(ctx);
    const user = new Parse.User();
    user.set("username", "parse-signup");
    user.set("password", "password");
    user.set("authData", {});
    await user.save(null, { useMasterKey: true });

    expect(
      await rawCollection("captioner").findOne({ userId: user.id }),
    ).toMatchObject({ nameTag: 99999 });
    expect(
      await rawCollection("captionerPrivate").countDocuments({
        captionerId: user.id,
      }),
    ).toBe(1);
  });

  it("doesn't let object params act as query operators", async (ctx) => {
    skipIfNoServer(ctx);
    const user = new Parse.User();
    user.set("username", "someone");
    user.set("password", "password");
    user.set("authData", {});
    await user.save(null, { useMasterKey: true });

    expect(
      await Parse.Cloud.run("loadProfile", { profileId: { $ne: null } }),
    ).toEqual({ status: "error" });
    expect(
      await Parse.Cloud.run("loadUserCaptions", {
        captionerId: { $ne: null },
      }),
    ).toMatchObject({ status: "success", captions: [] });
  });

  it("still rejects Parse signups without authData", async () => {
    const user = new Parse.User();
    user.set("username", "no-auth-data");
    user.set("password", "password");
    await expect(user.signUp()).rejects.toThrow(
      "No authentication data provided",
    );
  });

  describe("migrations", () => {
    const migrationParams = {
      videoId: "migrated-video",
      videoSource: 0,
      nameMap: { "migrated-video": "Migrated" },
    };

    it("require the master key and maintenance mode", async (ctx) => {
      skipIfNoServer(ctx);
      await Parse.Config.save({ maintenance: true });
      expect(
        await invokeRest("POST", "/admin/migration/video", {
          body: migrationParams,
        }),
      ).toEqual({ status: "failed" });

      await Parse.Config.save({ maintenance: false });
      expect(
        await invokeRest("POST", "/admin/migration/video", {
          body: migrationParams,
          masterKey: true,
        }),
      ).toEqual({ status: "failed" });
      expect(await rawCollection("videos").countDocuments({})).toBe(0);
    });

    it("run through both the REST API and Parse", async (ctx) => {
      skipIfNoServer(ctx);
      await Parse.Config.save({ maintenance: true });
      expect(
        await invokeRest("POST", "/admin/migration/video", {
          body: migrationParams,
          masterKey: true,
        }),
      ).toEqual({ status: "added", name: "Migrated" });
      expect(
        await Parse.Cloud.run("createVideo", migrationParams, {
          useMasterKey: true,
        }),
      ).toEqual({ status: "skipped" });
      expect(
        await rawCollection("videos").findOne({ sourceId: "migrated-video" }),
      ).toMatchObject({
        source: "0",
        name: "Migrated",
        language: "unk",
        captions: {},
        captionCount: 0,
      });

      await Parse.Cloud.run(
        "migrationCreateCaptionerWithoutUser",
        { name: "Old captioner", email: "old@example.com" },
        { useMasterKey: true },
      );
      expect(
        await invokeRest("POST", "/admin/migration/caption", {
          masterKey: true,
          body: {
            content: "{}",
            videoId: "migrated-video",
            languageCode: "en",
            email: "old@example.com",
          },
        }),
      ).toEqual({ status: "added" });
      const caption = await rawCollection("captions").findOne({});
      const captioner = await rawCollection("captioner").findOne({
        name: "Old captioner",
      });
      expect(caption).toMatchObject({
        creatorId: captioner!._id,
        translatedTitle: "Imported from YTExternalCC",
        tags: ["ytExCC"],
      });
      expect(
        await rawCollection("videos").findOne({ sourceId: "migrated-video" }),
      ).toMatchObject({ captionCount: 1, captions: { en: 1 } });
    });
  });
});
