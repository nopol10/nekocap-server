import { captionTags } from "@/common/constants";
import { GetAutoCaptionListParams } from "@/common/feature/caption-editor/types";
import { VideoSource } from "@/common/feature/video/types";
import {
  CaptionerPrivateSchema,
  VideoSchema,
} from "@/common/providers/parse/types";
import { getPublicReadAdminReviewerACL } from "./acl";
import { isInMaintenanceMode } from "./config";
import { PARSE_CLASS } from "./constants";
import { createCaptionerWithoutUser } from "./user-apis";
import { getVideoName } from "./utils";

Parse.Cloud.define(
  "createVideo",
  async (
    request: Parse.Cloud.FunctionRequest<
      GetAutoCaptionListParams & { nameMap?: { [id: string]: string } }
    >
  ): Promise<{ status: "added" | "skipped" | "failed"; name?: string }> => {
    if (!request.master) {
      return { status: "failed" };
    }
    if (!(await isInMaintenanceMode())) {
      return { status: "failed" };
    }
    const { videoId, videoSource, nameMap = {} } = request.params;

    const sourceString = videoSource.toString();
    const videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
    videoQuery.equalTo("sourceId", videoId);
    videoQuery.equalTo("source", sourceString);
    const videoResult = await videoQuery.first();
    if (!videoResult) {
      const videoName =
        nameMap[videoId] || (await getVideoName(videoSource, videoId));
      const Video = Parse.Object.extend(PARSE_CLASS.videos);
      const newVideo = new Video();
      newVideo.set("language", "unk");
      newVideo.set("sourceId", videoId);
      newVideo.set("source", sourceString);
      newVideo.set("name", videoName);
      newVideo.set("captions", {});
      newVideo.set("captionCount", 0);
      await newVideo.save(null, { useMasterKey: true });
      return { status: "added", name: videoName };
    }
    return { status: "skipped" };
  }
);

Parse.Cloud.define(
  "createBatchYoutubeVideos",
  async (
    request: Parse.Cloud.FunctionRequest<{
      videoIds: string[];
      nameMap?: { [id: string]: string };
    }>
  ): Promise<{ status: "added" | "skipped" | "failed"; name?: string }> => {
    if (!request.master) {
      return { status: "failed" };
    }
    if (!(await isInMaintenanceMode())) {
      return { status: "failed" };
    }
    const { videoIds, nameMap = {} } = request.params;

    const sourceString = VideoSource.Youtube.toString();
    let videos = [];
    for (let i = 0; i < videoIds.length; i++) {
      if (i % 100 === 0) {
        await Parse.Object.saveAll(videos, {
          useMasterKey: true,
          batchSize: 5000,
        });
        videos = [];
        console.log(`Processed ${i}/${videoIds.length}`);
      }
      const videoId = videoIds[i];
      const videoQuery = new Parse.Query<VideoSchema>(PARSE_CLASS.videos);
      videoQuery.equalTo("sourceId", videoId);
      videoQuery.equalTo("source", sourceString);
      const videoResult = await videoQuery.first();
      if (!videoResult) {
        const videoName = nameMap[videoId] || "";
        const Video = Parse.Object.extend(PARSE_CLASS.videos);
        const newVideo: Parse.Object = new Video();
        newVideo.set("language", "unk");
        newVideo.set("sourceId", videoId);
        newVideo.set("source", sourceString);
        newVideo.set("name", videoName);
        newVideo.set("captions", {});
        newVideo.set("captionCount", 0);
        videos.push(newVideo);
      }
    }
    await Parse.Object.saveAll(videos, { useMasterKey: true, batchSize: 5000 });
    return { status: "added" };
  }
);

Parse.Cloud.define(
  "migrationCreateCaptionerWithoutUser",
  async (
    request: Parse.Cloud.FunctionRequest<{
      name: string;
      email: string;
    }>
  ): Promise<{ status: "added" | "skipped" | "failed" }> => {
    if (!request.master) {
      return { status: "failed" };
    }
    if (!(await isInMaintenanceMode())) {
      return { status: "failed" };
    }
    const { name, email } = request.params;
    await createCaptionerWithoutUser({ name, email });
    return { status: "added" };
  }
);

const MIGRATED_TITLE = "Imported from YTExternalCC";

Parse.Cloud.define(
  "migrationCreateCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{
      content: string;
      videoId: string;
      languageCode: string;
      createdDate: string;
      email: string;
      userId?: string;
    }>
  ): Promise<{ status: "added" | "skipped" | "failed" }> => {
    if (!request.master) {
      return { status: "failed" };
    }
    if (!(await isInMaintenanceMode())) {
      return { status: "failed" };
    }
    const { content, videoId, languageCode, userId, email } = request.params;

    let captionerId = "";
    if (userId) {
      // Verify that the user exists
      const userQuery = new Parse.Query(Parse.User);
      userQuery.equalTo("objectId", userId);
      const user = await userQuery.first({ useMasterKey: true });
      if (!user) {
        console.log(`User ${userId} does not exist`);
        return { status: "failed" };
      }
      captionerId = userId;
    } else {
      const privateQuery = new Parse.Query<CaptionerPrivateSchema>(
        PARSE_CLASS.captionerPrivate
      );
      privateQuery.equalTo("email", email);
      const captionerPrivate = await privateQuery.first({ useMasterKey: true });
      if (!captionerPrivate) {
        return { status: "failed" };
      }
      captionerId = captionerPrivate.get("captionerId");
    }
    const Caption = Parse.Object.extend(PARSE_CLASS.captions);
    const newCaption = new Caption();
    newCaption.set("creatorId", captionerId);
    newCaption.set("language", languageCode);
    newCaption.set("videoId", videoId);
    newCaption.set("videoSource", VideoSource.Youtube.toString());
    newCaption.set("content", content);
    newCaption.set("translatedTitle", MIGRATED_TITLE);
    newCaption.set("tags", [captionTags.ytExCC]);
    newCaption.setACL(getPublicReadAdminReviewerACL());
    await newCaption.save(null, { useMasterKey: true });
    return { status: "added" };
  }
);
