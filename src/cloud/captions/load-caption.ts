import { isAss } from "@/common/caption-utils";
import type {
  CaptionLikesSchema,
  CaptionSchema,
  ServerSingleCaption,
  VideoSchema,
} from "@/common/providers/parse/types";
import type { RawCaptionData } from "@/common/feature/video/types";
import type { CaptionFileFormat } from "@/common/types";
import { PARSE_CLASS } from "../constants";
import { getUserProfile } from "../users/get-user-profile";

export const loadRawCaptionData = async (
  caption: CaptionSchema,
): Promise<string> => {
  const file: Parse.File | undefined = caption.get("rawFile");
  if (!file) {
    return "";
  }
  let rawContent = caption.get("rawContent");
  if (!rawContent) {
    return "";
  }
  rawContent = JSON.parse(rawContent);
  const fileData = await file.getData();
  if (!fileData) {
    return "";
  }
  rawContent.data = fileData;
  return JSON.stringify(rawContent);
};

export const loadRawCaptionUrl = async (
  caption: CaptionSchema,
): Promise<{ url: string; type?: keyof typeof CaptionFileFormat }> => {
  const file: Parse.File | undefined = caption.get("rawFile");
  if (!file) {
    return { url: "" };
  }
  let rawContent = caption.get("rawContent");
  if (!rawContent) {
    return { url: "" };
  }
  const parsedRawContent: RawCaptionData = JSON.parse(rawContent);

  return {
    url: file.url() || "",
    type: parsedRawContent.type,
  };
};

export const loadCaption = async (
  captionId: string,
  user?: Parse.User,
): Promise<ServerSingleCaption | undefined> => {
  const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
  query.equalTo("objectId", captionId);
  const caption = await query.first({ useMasterKey: true });
  if (!caption) {
    return undefined;
  }
  caption.increment("views");
  // We'll send the url back and let the client retrieve it
  // We cannot get the file inside cloud code when it is running in docker as the file's url contains under the server's public IP.
  // Connecting to a docker host's public IP from inside a docker container running in that host leads to a timeout
  const rawCaptionMeta = (await loadRawCaptionUrl(caption)) || undefined;
  // We'll only return the raw caption for Substation Alpha formats as others do not require the original for rendering
  const rawCaptionUrl = isAss(rawCaptionMeta.type) ? rawCaptionMeta.url : "";
  const rawCaption: RawCaptionData = {
    type:
      (rawCaptionMeta.type as keyof typeof CaptionFileFormat | undefined) ||
      "srt",
    data: "",
  };

  const [video, captioner, _] = await Promise.all([
    loadVideo(caption.get("videoId"), caption.get("videoSource")),
    getUserProfile(caption.get("creatorId")),
    caption.save(null, { useMasterKey: true }),
  ]);
  const originalTitle = video ? video.get("name") : "";
  const captionerName = captioner?.name ?? "Unknown";
  // Get like and dislike data if user is logged in
  if (!user || !user.getSessionToken()) {
    return {
      caption,
      rawCaption: JSON.stringify(rawCaption),
      rawCaptionUrl: rawCaptionUrl,
      originalTitle,
      captionerName,
    };
  }

  const { id: userId } = user;
  const sessionToken = user.getSessionToken() ?? undefined;
  const likesQuery = new Parse.Query<CaptionLikesSchema>(
    PARSE_CLASS.captionLikes,
  );
  likesQuery.equalTo("userId", userId);
  const likesObjects = await likesQuery.find({ sessionToken });
  let likesObject: CaptionLikesSchema;
  if (!likesObjects || likesObjects.length <= 0) {
    return {
      caption,
      rawCaptionUrl: rawCaptionUrl,
      originalTitle,
      captionerName,
    };
  }
  likesObject = likesObjects[0];
  const userLike = (likesObject.get("likes") || []).includes(captionId);
  const userDislike = (likesObject.get("dislikes") || []).includes(captionId);

  return {
    caption,
    rawCaptionUrl: rawCaptionUrl,
    userLike,
    userDislike,
    originalTitle,
    captionerName,
  };
};

export const loadVideo = async (videoId: string, videoSource: string) => {
  const videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
  videoQuery.equalTo("sourceId", videoId);
  videoQuery.equalTo("source", videoSource);
  return await videoQuery.first();
};
