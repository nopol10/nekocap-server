import Parse from "parse/node";

import { PARSE_CLASS } from "../../src/cloud/constants";
import { role } from "../../src/cloud/roles";

export interface TestUser {
  user: Parse.User<Parse.Attributes>;
  sessionToken: string;
}

export async function createTestUser({
  username,
  password = "test-password",
  email,
}: {
  username: string;
  password?: string;
  email?: string;
}): Promise<TestUser> {
  const user = new Parse.User();
  user.set("username", username);
  user.set("password", password);
  if (email) user.set("email", email);
  // The Parse `_User` beforeSave hook rejects signups without `authData` so
  // that browser users go through the Firebase auth adapter. Tests bypass
  // that path by saving with the master key (the hook also short-circuits on
  // `request.master`) and logging in afterwards to mint a session token.
  user.set("authData", {});
  await user.save(null, { useMasterKey: true });
  // `parse` ships its own typings that clash with `@types/parse`: the package's
  // `ParseUser` class (what `logIn` returns) is structurally close to but not
  // assignable to the `@types/parse` `User<Attributes>` interface. Reuse the
  // already-typed `user` (a `Parse.User<Parse.Attributes>`) and just attach the
  // session token from the login call.
  const loggedIn = await Parse.User.logIn(username, password);
  const sessionToken = loggedIn.getSessionToken();
  if (!sessionToken) {
    throw new Error("Expected session token after logIn");
  }
  return { user, sessionToken };
}

export async function makeUserAdmin(
  user: Parse.User<Parse.Attributes>,
): Promise<void> {
  const acl = new Parse.ACL();
  acl.setPublicReadAccess(true);

  const query = new Parse.Query(Parse.Role);
  query.equalTo("name", role.admin);
  let adminRole = await query.first({ useMasterKey: true });
  if (!adminRole) {
    adminRole = new Parse.Role(role.admin, acl);
  }
  adminRole.getUsers().add(user);
  await adminRole.save(null, { useMasterKey: true });
}

export interface CreateCaptionerInput {
  userId: string;
  name?: string;
  verified?: boolean;
  banned?: boolean;
}

export async function createCaptioner({
  userId,
  name = "Test Captioner",
  verified = false,
  banned = false,
}: CreateCaptionerInput): Promise<Parse.Object<Parse.Attributes>> {
  const Captioner = Parse.Object.extend(PARSE_CLASS.captioner);
  const captioner = new Captioner();
  captioner.set("userId", userId);
  captioner.set("name", name);
  captioner.set("verified", verified);
  captioner.set("banned", banned);
  await captioner.save(null, { useMasterKey: true });
  return captioner;
}

export interface CreateVideoInput {
  sourceId: string;
  source: string;
  name?: string;
  language?: string;
}

export async function createVideo({
  sourceId,
  source,
  name = "Test Video",
  language = "en",
}: CreateVideoInput): Promise<Parse.Object<Parse.Attributes>> {
  const Video = Parse.Object.extend(PARSE_CLASS.videos);
  const video = new Video();
  video.set("sourceId", sourceId);
  video.set("source", source);
  video.set("name", name);
  video.set("language", language);
  await video.save(null, { useMasterKey: true });
  return video;
}

export interface CreateCaptionInput {
  creatorId: string;
  videoId: string;
  videoSource: string;
  language?: string;
  translatedTitle?: string;
  privacy?: number;
}

export async function createCaption({
  creatorId,
  videoId,
  videoSource,
  language = "en",
  translatedTitle,
  privacy = 0,
}: CreateCaptionInput): Promise<Parse.Object<Parse.Attributes>> {
  const Caption = Parse.Object.extend(PARSE_CLASS.captions);
  const caption = new Caption();
  caption.set("creatorId", creatorId);
  caption.set("videoId", videoId);
  caption.set("videoSource", videoSource);
  caption.set("language", language);
  caption.set("privacy", privacy);
  if (translatedTitle !== undefined) {
    caption.set("translatedTitle", translatedTitle);
  }
  await caption.save(null, { useMasterKey: true });
  return caption;
}

export async function resetCollections(): Promise<void> {
  // Captioners go first so the caption afterDelete hook has no counts to
  // update while the captions are being cleared
  const classes = [
    PARSE_CLASS.captioner,
    PARSE_CLASS.captions,
    PARSE_CLASS.videos,
    "_User",
    "_Role",
    "_Session",
  ];
  for (const className of classes) {
    const query = new Parse.Query(className);
    query.limit(1000);
    const rows = await query.find({ useMasterKey: true });
    if (rows.length === 0) continue;
    await Parse.Object.destroyAll(rows, { useMasterKey: true });
  }
}
