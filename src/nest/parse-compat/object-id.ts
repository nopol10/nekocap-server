import { randomBytes } from "crypto";

// Mirrors parse-server's src/cryptoUtils.js so that ids and tokens created by
// NestJS are indistinguishable from the ones Parse creates.

const OBJECT_ID_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "abcdefghijklmnopqrstuvwxyz" + "0123456789";

export const randomHexString = (size: number): string => {
  if (size === 0 || size % 2 !== 0) {
    throw new Error("randomHexString size must be a positive even number");
  }
  return randomBytes(size / 2).toString("hex");
};

export const randomString = (size: number): string => {
  const bytes = randomBytes(size);
  let result = "";
  for (let i = 0; i < bytes.length; ++i) {
    result += OBJECT_ID_CHARS[bytes.readUInt8(i) % OBJECT_ID_CHARS.length];
  }
  return result;
};

/** A new 10 character objectId, the same format Parse uses for `_id` */
export const newObjectId = (): string => randomString(10);

/** Parse session tokens are `r:` followed by 32 hex characters */
export const newSessionToken = (): string => `r:${randomHexString(32)}`;

/** Parse generates 25 character random usernames for users created through authData */
export const newUsername = (): string => randomString(25);
