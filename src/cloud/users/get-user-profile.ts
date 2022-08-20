import type { CaptionerFields } from "@/common/feature/captioner/types";
import { CaptionerSchema } from "@/common/providers/parse/types";
import { PARSE_CLASS } from "cloud/constants";
import {
  hasAdminRole,
  hasReviewerRole,
  hasReviewerManagerRole,
} from "cloud/utils";

export const getUserProfile = async (
  userId: string
): Promise<CaptionerFields | undefined> => {
  const query = new Parse.Query<CaptionerSchema>(PARSE_CLASS.captioner);
  query.equalTo("userId", userId);
  const captioner = await query.first();
  if (!captioner) {
    return undefined;
  }

  const userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo("objectId", userId);
  const user = await userQuery.first({ useMasterKey: true });

  let isAdmin = false;
  let isReviewer = false;
  let isReviewerManager = false;
  if (user) {
    isAdmin = user ? await hasAdminRole(user) : false;
    isReviewer = user ? await hasReviewerRole(user) : false;
    isReviewerManager = user ? await hasReviewerManagerRole(user) : false;
  }

  return {
    name: captioner.get("name"),
    nameTag: captioner.get("nameTag"),
    profileMessage: captioner.get("profileMessage"),
    recs: captioner.get("recs"),
    userId: userId,
    verified: captioner.get("verified"),
    banned: captioner.get("banned"),
    lastSubmissionTime: captioner.get("lastSubmissionTime") || 0,
    donationLink: captioner.get("donationLink"),
    languageCodes: captioner.get("languages"),
    captionCount: captioner.get("captionCount") || 0,
    captionTags: captioner.get("captionTags") || [],
    isAdmin,
    isReviewer,
    isReviewerManager,
  };
};
