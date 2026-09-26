import { ROLES } from "../constants";

/**
 * The way Parse stores an ACL on a Mongo document: the `_acl` map plus the
 * denormalised `_rperm` / `_wperm` arrays that Parse queries against.
 */
export type ParseAclFields = {
  _acl: Record<string, { r?: true; w?: true }>;
  _rperm: string[];
  _wperm: string[];
};

type AclEntry = { read?: boolean; write?: boolean };

const PUBLIC = "*";
const roleKey = (role: string) => `role:${role}`;

export const buildAcl = (entries: Record<string, AclEntry>): ParseAclFields => {
  const acl: ParseAclFields = { _acl: {}, _rperm: [], _wperm: [] };
  for (const [key, { read, write }] of Object.entries(entries)) {
    if (!read && !write) {
      continue;
    }
    acl._acl[key] = {};
    if (read) {
      acl._acl[key].r = true;
      acl._rperm.push(key);
    }
    if (write) {
      acl._acl[key].w = true;
      acl._wperm.push(key);
    }
  }
  return acl;
};

// The factories below mirror the ones in src/cloud/acl.ts that are in use.

/** Captions: public read, admins and reviewers can read and write */
export const getPublicReadAdminReviewerACL = () =>
  buildAcl({
    [PUBLIC]: { read: true },
    [roleKey(ROLES.admin)]: { read: true, write: true },
    [roleKey(ROLES.reviewer)]: { read: true, write: true },
  });

/** Captioners without a user: public read, admins write, reviewers read */
export const getPublicReadAdminACL = () =>
  buildAcl({
    [PUBLIC]: { read: true },
    [roleKey(ROLES.admin)]: { read: true, write: true },
    [roleKey(ROLES.reviewer)]: { read: true },
  });

/** Caption likes and user-less private captioner data: admins only */
export const getAdminACL = () =>
  buildAcl({
    [roleKey(ROLES.admin)]: { read: true, write: true },
  });

/** Captioner: public read, the owner can read, admins can read and write */
export const getUserReadAdminPublicACL = (userId: string) =>
  buildAcl({
    [userId]: { read: true },
    [PUBLIC]: { read: true },
    [roleKey(ROLES.admin)]: { read: true, write: true },
  });

/** Private captioner data: the owner can read, admins can read and write */
export const getUserReadAdminACL = (userId: string) =>
  buildAcl({
    [userId]: { read: true },
    [roleKey(ROLES.admin)]: { read: true, write: true },
  });

/** The ACL Parse gives a newly signed up `_User` */
export const getUserOwnACL = (userId: string) =>
  buildAcl({
    [userId]: { read: true, write: true },
  });
