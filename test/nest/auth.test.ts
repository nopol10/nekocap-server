import { describe, expect, it } from "vitest";
import { createTestUser } from "../helpers/fixtures";
import { invokeRest } from "../helpers/invoke-rest";
import { rawCollection } from "../helpers/mongo";
import { getTestServer } from "../helpers/parse-test-server";
import { validAuthData } from "../helpers/test-identity-provider";
import { useTestServer } from "../helpers/use-test-server";

type LoginResponse = {
  status: string;
  error?: string;
  sessionToken?: string;
  userId?: string;
  username?: string;
  isNewUser?: boolean;
};

const login = (authData: Record<string, unknown>, provider?: string) =>
  invokeRest<LoginResponse>("POST", "/auth/login", {
    body: { provider, authData },
  });

/** What Parse Server itself thinks of a session token (GET /parse/users/me) */
const parseMe = async (sessionToken: string) => {
  const server = getTestServer();
  const response = await fetch(`${server.serverURL}/users/me`, {
    headers: {
      "X-Parse-Application-Id": server.appId,
      "X-Parse-Session-Token": sessionToken,
    },
  });
  return { ok: response.ok, body: await response.json() };
};

const me = (sessionToken?: string) =>
  invokeRest<LoginResponse>("GET", "/auth/me", { sessionToken });

describe("auth", () => {
  const { skipIfNoServer } = useTestServer("auth.test");

  it("creates a Parse compatible user, captioner records and session on first login", async (ctx) => {
    skipIfNoServer(ctx);
    const response = await login(validAuthData("firebase-uid-1"));

    expect(response.status).toBe("success");
    expect(response.isNewUser).toBe(true);
    expect(response.sessionToken).toMatch(/^r:[0-9a-f]{32}$/);
    const userId = response.userId!;
    expect(userId).toMatch(/^[A-Za-z0-9]{10}$/);

    const user = await rawCollection("_User").findOne({ _id: userId as never });
    expect(user).toMatchObject({
      _auth_data_firebase: { id: "firebase-uid-1" },
      _rperm: [userId],
      _wperm: [userId],
      _acl: { [userId]: { r: true, w: true } },
    });
    const session = await rawCollection("_Session").findOne({
      _session_token: response.sessionToken,
    });
    expect(session).toMatchObject({
      _p_user: `_User$${userId}`,
      createdWith: { action: "login", authProvider: "firebase" },
    });
    expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const captioner = await rawCollection("captioner").findOne({ userId });
    expect(captioner).toMatchObject({
      nameTag: 99999,
      _rperm: expect.arrayContaining([userId, "*", "role:admin"]),
      _wperm: ["role:admin"],
    });
    expect(
      await rawCollection("captionerPrivate").countDocuments({
        captionerId: userId,
      }),
    ).toBe(1);
  });

  it("logs an existing user back in without creating duplicates", async (ctx) => {
    skipIfNoServer(ctx);
    const first = await login(validAuthData("firebase-uid-2"));
    const second = await login(validAuthData("firebase-uid-2"));

    expect(second.status).toBe("success");
    expect(second.isNewUser).toBe(false);
    expect(second.userId).toBe(first.userId);
    expect(second.sessionToken).not.toBe(first.sessionToken);
    expect(
      await rawCollection("captioner").countDocuments({
        userId: first.userId,
      }),
    ).toBe(1);
  });

  it("rejects invalid credentials and unknown providers", async (ctx) => {
    skipIfNoServer(ctx);
    const invalid = await login({ id: "uid", access_token: "forged" });
    expect(invalid.status).toBe("error");
    expect(invalid.sessionToken).toBeUndefined();

    const unknown = await login(validAuthData("uid"), "not-a-provider");
    expect(unknown).toEqual({
      status: "error",
      error: "Unsupported login method",
    });
    expect(await rawCollection("_User").countDocuments({})).toBe(0);
  });

  it("issues sessions that Parse Server accepts", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken, userId } = await login(
      validAuthData("firebase-uid-3"),
    );

    const parseUser = await parseMe(sessionToken!);
    expect(parseUser.ok).toBe(true);
    expect(parseUser.body.objectId).toBe(userId);
  });

  it("accepts sessions issued by Parse Server", async (ctx) => {
    skipIfNoServer(ctx);
    const { user, sessionToken } = await createTestUser({
      username: "parse-login",
    });

    const response = await me(sessionToken);
    expect(response).toMatchObject({ status: "success", userId: user.id });
  });

  it("accepts the session token in the Parse header too", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken, userId } = await login(
      validAuthData("firebase-uid-4"),
    );
    const response = await fetch(`${getTestServer().apiURL}/auth/me`, {
      headers: { "X-Parse-Session-Token": sessionToken! },
    });
    expect(await response.json()).toMatchObject({ userId });
  });

  it("ends the session on logout", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken } = await login(validAuthData("firebase-uid-5"));
    await invokeRest("POST", "/auth/logout", { sessionToken });

    expect((await me(sessionToken)).status).toBe("error");
    expect((await parseMe(sessionToken!)).ok).toBe(false);
  });

  it("treats unknown session tokens as anonymous", async (ctx) => {
    skipIfNoServer(ctx);
    expect(await me("r:not-a-session")).toEqual({
      status: "error",
      error: "Not authorized! Please login",
    });
  });

  it("links another identity provider to the logged in user", async (ctx) => {
    skipIfNoServer(ctx);
    const { sessionToken, userId } = await login(
      validAuthData("firebase-uid-6"),
    );
    // Only the "firebase" test provider is registered, link it again with a
    // different id to exercise the flow
    const linked = await invokeRest("POST", "/auth/link", {
      sessionToken,
      body: { provider: "firebase", authData: validAuthData("other-uid") },
    });
    expect(linked).toEqual({ status: "success" });
    const relogin = await login(validAuthData("other-uid"));
    expect(relogin.userId).toBe(userId);
  });
});
