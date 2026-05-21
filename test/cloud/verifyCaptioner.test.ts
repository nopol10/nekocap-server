import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
import Parse from "parse/node";
import {
  MongoUnavailableError,
  startParseServer,
  stopParseServer,
} from "../helpers/parse-test-server";
import { invokeCloudFunction } from "../helpers/invoke-cloud-function";
import {
  createCaptioner,
  createTestUser,
  makeUserAdmin,
  resetCollections,
} from "../helpers/fixtures";
import { ERROR_MESSAGES } from "../../src/cloud/constants";

interface ServerResponse {
  status: "success" | "error";
  error?: string;
}

let skipReason: string | undefined;

const skipIfNoServer = (ctx: TestContext) => {
  if (skipReason) ctx.skip(skipReason);
};

describe("verifyCaptioner cloud function", () => {
  beforeAll(async () => {
    try {
      await startParseServer();
    } catch (err) {
      if (err instanceof MongoUnavailableError) {
        skipReason = err.message;
        console.warn(`[verifyCaptioner.test] skipping: ${err.message}`);
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
    await Parse.Config.save({ maintenance: false });
  });

  it("returns NOT_LOGGED_IN when no session token is supplied", async (ctx) => {
    skipIfNoServer(ctx);
    const res = await invokeCloudFunction<ServerResponse>("verifyCaptioner", {
      targetUserId: "anyone",
    });
    expect(res).toEqual({
      status: "error",
      error: ERROR_MESSAGES.NOT_LOGGED_IN,
    });
  });

  it("returns 'Not authorized!' when caller is not an admin", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken } = await createTestUser({ username: "non-admin" });
    const res = await invokeCloudFunction<ServerResponse>(
      "verifyCaptioner",
      { targetUserId: "any" },
      { sessionToken },
    );
    expect(res).toEqual({ status: "error", error: "Not authorized!" });
  });

  it("returns 'Target user not found!' when no captioner matches", async (ctx) => {
    skipIfNoServer(ctx);
    const { user, sessionToken } = await createTestUser({ username: "admin1" });
    await makeUserAdmin(user);
    const res = await invokeCloudFunction<ServerResponse>(
      "verifyCaptioner",
      { targetUserId: "missing" },
      { sessionToken },
    );
    expect(res).toEqual({ status: "error", error: "Target user not found!" });
  });

  it("flips a captioner's verified flag from false to true", async (ctx) => {
    skipIfNoServer(ctx);
    const { user, sessionToken } = await createTestUser({ username: "admin2" });
    await makeUserAdmin(user);
    const captioner = await createCaptioner({
      userId: "target-1",
      name: "Target One",
      verified: false,
    });

    const res = await invokeCloudFunction<ServerResponse>(
      "verifyCaptioner",
      { targetUserId: "target-1" },
      { sessionToken },
    );
    expect(res).toEqual({ status: "success" });

    await captioner.fetch({ useMasterKey: true });
    expect(captioner.get("verified")).toBe(true);
  });

  it("flips a captioner's verified flag back from true to false", async (ctx) => {
    skipIfNoServer(ctx);
    const { user, sessionToken } = await createTestUser({ username: "admin3" });
    await makeUserAdmin(user);
    const captioner = await createCaptioner({
      userId: "target-2",
      name: "Target Two",
      verified: true,
    });

    const res = await invokeCloudFunction<ServerResponse>(
      "verifyCaptioner",
      { targetUserId: "target-2" },
      { sessionToken },
    );
    expect(res).toEqual({ status: "success" });

    await captioner.fetch({ useMasterKey: true });
    expect(captioner.get("verified")).toBe(false);
  });

  it("returns MAINTENANCE error when the maintenance config flag is on", async (ctx) => {
    skipIfNoServer(ctx);
    const { user, sessionToken } = await createTestUser({ username: "admin4" });
    await makeUserAdmin(user);
    await Parse.Config.save({ maintenance: true });

    const res = await invokeCloudFunction<ServerResponse>(
      "verifyCaptioner",
      { targetUserId: "anything" },
      { sessionToken },
    );
    expect(res).toEqual({
      status: "error",
      error: ERROR_MESSAGES.MAINTENANCE,
    });
  });
});
