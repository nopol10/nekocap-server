import { role } from "./roles";

export const getUserReadWriteACL = (user: Parse.User) => {
  const acl = new Parse.ACL();
  acl.setReadAccess(user, true);
  acl.setWriteAccess(user, true);
  acl.setPublicReadAccess(false);
  return acl;
};

export const getUserReadWritePublicReadACL = (user: Parse.User) => {
  const acl = new Parse.ACL();
  acl.setReadAccess(user, true);
  acl.setWriteAccess(user, true);
  acl.setPublicReadAccess(true);
  return acl;
};

export const getUserReadWriteAdminReviewerPublicReadACL = (
  user: Parse.User
) => {
  const acl = new Parse.ACL();
  acl.setReadAccess(user, true);
  acl.setWriteAccess(user, true);
  acl.setPublicReadAccess(true);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  acl.setRoleReadAccess(role.reviewer, true);
  acl.setRoleWriteAccess(role.reviewer, true);
  return acl;
};

export const getUserReadWriteAdminReviewerACL = (user: Parse.User) => {
  const acl = new Parse.ACL();
  acl.setReadAccess(user, true);
  acl.setWriteAccess(user, true);
  acl.setPublicReadAccess(false);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  acl.setRoleReadAccess(role.reviewer, true);
  acl.setRoleWriteAccess(role.reviewer, true);
  return acl;
};

export const getAdminReviewerACL = () => {
  const acl = new Parse.ACL();
  acl.setPublicReadAccess(false);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  acl.setRoleReadAccess(role.reviewer, true);
  acl.setRoleWriteAccess(role.reviewer, true);
  return acl;
};

export const getPublicReadAdminACL = () => {
  const acl = new Parse.ACL();
  acl.setPublicReadAccess(true);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  acl.setRoleReadAccess(role.reviewer, true);
  return acl;
};

export const getPublicReadAdminReviewerACL = () => {
  const acl = new Parse.ACL();
  acl.setPublicReadAccess(true);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  acl.setRoleReadAccess(role.reviewer, true);
  acl.setRoleWriteAccess(role.reviewer, true);
  return acl;
};

export const getAdminACL = () => {
  const acl = new Parse.ACL();
  acl.setPublicReadAccess(false);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  return acl;
};

export const getUserReadWriteAdminACL = (user: Parse.User) => {
  const acl = new Parse.ACL();
  acl.setReadAccess(user, true);
  acl.setWriteAccess(user, true);
  acl.setPublicReadAccess(false);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  return acl;
};

export const getUserReadAdminACL = (user: Parse.User) => {
  const acl = new Parse.ACL();
  acl.setReadAccess(user, true);
  acl.setPublicReadAccess(false);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  return acl;
};

export const getUserReadWriteAdminPublicACL = (user: Parse.User) => {
  const acl = new Parse.ACL();
  acl.setReadAccess(user, true);
  acl.setWriteAccess(user, true);
  acl.setPublicReadAccess(true);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  return acl;
};

export const getUserReadAdminPublicACL = (user: Parse.User) => {
  const acl = new Parse.ACL();
  acl.setReadAccess(user, true);
  acl.setPublicReadAccess(true);
  acl.setRoleReadAccess(role.admin, true);
  acl.setRoleWriteAccess(role.admin, true);
  return acl;
};
