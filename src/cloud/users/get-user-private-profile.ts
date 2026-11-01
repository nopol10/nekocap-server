import type { CaptionerPrivateFields } from "@/common/feature/captioner/types";
import type { CaptionerPrivateSchema } from "@/common/providers/parse/types";
import { PARSE_CLASS } from "../constants";
import {
  hasAdminRole,
  hasReviewerManagerRole,
  hasReviewerRole,
} from "../utils";

export const getUserPrivateProfile = async (
  targetUserId: string,
  sessionToken?: string,
  useMasterKey?: boolean,
): Promise<CaptionerPrivateFields | undefined> => {
  const query = new Parse.Query<CaptionerPrivateSchema>(
    PARSE_CLASS.captionerPrivate,
  );
  query.equalTo("captionerId", targetUserId);
  const captioner = await query.first({
    sessionToken: sessionToken,
    useMasterKey,
  });
  if (!captioner) {
    return undefined;
  }

  const userQuery = new Parse.Query<Parse.User>(Parse.User);
  userQuery.equalTo("objectId", targetUserId);
  const user = await userQuery.first({ useMasterKey: true });

  const isAdmin = user ? await hasAdminRole(user) : false;
  const isReviewer = user ? await hasReviewerRole(user) : false;
  const isReviewerManager = user ? await hasReviewerManagerRole(user) : false;

  return {
    isReviewer,
    isReviewerManager,
    isAdmin,
  };
};
