import type {
  VideoSource,
  VideoCaptionData,
} from "@/common/feature/video/types";
import { videoSourceToProcessorMap } from "@/common/feature/video/utils";
import { getBaseLanguageCode, languages } from "@/common/languages";
import { role } from "./roles";

export const unixSeconds = (date: Date) => {
  return parseInt((date.getTime() / 1000).toFixed(0));
};

export const getVideoName = async (
  videoSource: VideoSource,
  videoId: string
): Promise<string> => {
  const processor = videoSourceToProcessorMap[videoSource];
  const oembedLink = processor.generateVideoLink(videoId);
  try {
    const videoInfo = await Parse.Cloud.httpRequest({
      url: "https://www.noembed.com/embed",
      params: {
        url: oembedLink,
      },
    });
    return videoInfo.data.title;
  } catch (e) {
    console.warn("Failed to retrieve OEmbed data:", e.message);
    return "";
  }
};

export const getRelatedLanguageCodes = (languageCode: string): string[] => {
  const baseLanguageCode = getBaseLanguageCode(languageCode);
  return Object.keys(languages).filter((language) => {
    if (
      language === baseLanguageCode ||
      language.startsWith(`${baseLanguageCode}_`)
    ) {
      return true;
    }
  });
};

export const getVideoCaptionCount = (captionData: VideoCaptionData): number => {
  return Object.keys(captionData).reduce((acc, key) => {
    return acc + captionData[key];
  }, 0);
};

export const hasRole = async (
  user: Parse.User,
  role: string
): Promise<boolean> => {
  const adminRoleQuery = new Parse.Query(Parse.Role);
  adminRoleQuery.equalTo("name", role);
  adminRoleQuery.equalTo("users", user);
  return !!(await adminRoleQuery.first());
};

export const hasSuperAdminRole = async (user: Parse.User): Promise<boolean> => {
  return await hasRole(user, role.superadmin);
};

export const hasAdminRole = async (user: Parse.User): Promise<boolean> => {
  // A user is an admin if they are a super admin
  const isSuperAdmin = await hasSuperAdminRole(user);
  if (isSuperAdmin) {
    return true;
  }
  return await hasRole(user, role.admin);
};

export const hasReviewerManagerRole = async (
  user: Parse.User
): Promise<boolean> => {
  return await hasRole(user, role.reviewerManager);
};

export const hasReviewerRole = async (user: Parse.User): Promise<boolean> => {
  // A user is a reviewer if they are a reviewer manager
  const isReviewerManager = await hasReviewerManagerRole(user);
  if (isReviewerManager) {
    return true;
  }
  return await hasRole(user, role.reviewer);
};

export const escapeRegexInString = (inString: string) => {
  return inString.replace(/[#-.]|[[-^]|[?|{}]/g, "\\$&");
};
