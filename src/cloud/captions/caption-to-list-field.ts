import { CaptionListFields } from "@/common/feature/video/types";
import { CaptionSchema, VideoSchema } from "@/common/providers/parse/types";
import { PARSE_CLASS } from "cloud/constants";
import { getUserProfile } from "cloud/users/get-user-profile";
import { unixSeconds } from "cloud/utils";

export const captionToListFields = async (
  sub: CaptionSchema
): Promise<CaptionListFields> => {
  const videoId = sub.get("videoId");
  const videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
  videoQuery.equalTo("sourceId", videoId);
  const video = await videoQuery.first();
  let videoName = "",
    videoLanguage = "",
    createdDate = 0,
    updatedDate = 0;
  if (video) {
    videoName = video.get("name");
    videoLanguage = video.get("language");
  }
  createdDate = unixSeconds(sub.createdAt);
  updatedDate = unixSeconds(sub.updatedAt);
  const creatorId = sub.get("creatorId");
  const captioner = await getUserProfile(creatorId);

  return <CaptionListFields>{
    id: sub.id,
    language: sub.get("language"),
    videoId,
    videoSource: sub.get("videoSource"),
    data: "",
    creatorId: sub.get("creatorId"),
    creatorName: captioner ? captioner.name : "",
    videoName,
    videoLanguage,
    views: sub.get("views") || 0,
    translatedTitle: sub.get("translatedTitle") || undefined,
    likes: sub.get("likes") || 0,
    dislikes: sub.get("dislikes") || 0,
    verified: sub.get("verified") || false,
    rejected: sub.get("rejected") || undefined,
    createdDate,
    updatedDate,
    tags: sub.get("tags") || [],
    privacy: sub.get("privacy") || 0,
  };
};

export const captionWithJoinedDataToListFields = async (
  joinedCaption: Record<string, any>
): Promise<CaptionListFields> => {
  const video = joinedCaption.video;

  const sub = Parse.Object.fromJSON({
    className: PARSE_CLASS.captions,
    ...joinedCaption,
  });
  const videoId = sub.get("videoId");
  let videoName = video.name,
    videoLanguage = video.language,
    createdDate = unixSeconds(new Date(video._created_at.iso)),
    updatedDate = unixSeconds(new Date(video._updated_at.iso));

  return <CaptionListFields>{
    id: sub.id,
    language: sub.get("language"),
    videoId,
    videoSource: sub.get("videoSource"),
    data: "",
    creatorId: sub.get("creatorId"),
    creatorName: joinedCaption.captioner ? joinedCaption.captioner.name : "",
    videoName,
    videoLanguage,
    views: sub.get("views") || 0,
    translatedTitle: sub.get("translatedTitle") || undefined,
    likes: sub.get("likes") || 0,
    dislikes: sub.get("dislikes") || 0,
    verified: sub.get("verified") || false,
    rejected: sub.get("rejected") || undefined,
    createdDate,
    updatedDate,
    tags: sub.get("tags") || [],
    privacy: sub.get("privacy") || 0,
  };
};
