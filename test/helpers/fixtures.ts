import Parse from "parse/node";
import { PARSE_CLASS } from "../../src/cloud/constants";
import { role } from "../../src/cloud/roles";

export interface TestUser {
  user: Parse.User;
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
  await user.signUp();
  const sessionToken = user.getSessionToken();
  if (!sessionToken) {
    throw new Error("Expected session token after signUp");
  }
  return { user, sessionToken };
}

export async function makeUserAdmin(user: Parse.User): Promise<void> {
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
}: CreateCaptionerInput): Promise<Parse.Object> {
  const Captioner = Parse.Object.extend(PARSE_CLASS.captioner);
  const captioner = new Captioner();
  captioner.set("userId", userId);
  captioner.set("name", name);
  captioner.set("verified", verified);
  captioner.set("banned", banned);
  await captioner.save(null, { useMasterKey: true });
  return captioner;
}

export async function resetCollections(): Promise<void> {
  const classes = [PARSE_CLASS.captioner, "_User", "_Role", "_Session"];
  for (const className of classes) {
    const query = new Parse.Query(className);
    query.limit(1000);
    const rows = await query.find({ useMasterKey: true });
    if (rows.length === 0) continue;
    await Parse.Object.destroyAll(rows, { useMasterKey: true });
  }
}
