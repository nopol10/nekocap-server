import { CaptionPrivacy } from "@/common/feature/video/types";
import type {
  CaptionSchema,
  CaptionerSchema,
  VideoSchema,
} from "@/common/providers/parse/types";
import { getUserReadAdminACL, getUserReadAdminPublicACL } from "./acl";

Parse.Cloud.beforeSave(Parse.User, function (request) {
  const user = request.object;
  if (!user.isNew()) {
    return;
  }
  // Prevent users from signing up with their own username and password
  if (!user.get("authData")) {
    throw new Error("No authentication data provided");
  }
});

Parse.Cloud.afterSave(Parse.User, function (request) {
  if (request.object.existed()) {
    return;
  }
  const id = request.object.id;
  const user: Parse.User = request.object as Parse.User;

  const Captioner = Parse.Object.extend("captioner");
  const newCaptioner = new Captioner();
  newCaptioner.setACL(getUserReadAdminPublicACL(user));
  newCaptioner.set("userId", id);
  newCaptioner.set("nameTag", 99999);
  newCaptioner.save(null, { useMasterKey: true });

  const CaptionerPrivate = Parse.Object.extend("captionerPrivate");
  const newCaptionerPrivate = new CaptionerPrivate();
  newCaptionerPrivate.setACL(getUserReadAdminACL(user));
  newCaptionerPrivate.set("captionerId", id);
  newCaptionerPrivate.save(null, { useMasterKey: true });
});

async function updateVideoCaptionCounts(request: Parse.Cloud.AfterSaveRequest) {
  const newCaption = request.object as CaptionSchema;
  const originalCaption = request.original as CaptionSchema;
  const newPrivacy = newCaption.get("privacy") || 0;
  let captionCountChange = 1;
  if (originalCaption) {
    const originalPrivacy = originalCaption.get("privacy") || 0;
    if (
      originalPrivacy === CaptionPrivacy.Public &&
      newPrivacy !== CaptionPrivacy.Public
    ) {
      captionCountChange = -1;
    } else if (originalPrivacy === newPrivacy) {
      captionCountChange = 0;
    }
    // The default case of anything --> public results in a change of +1, same as adding a new caption
  } else if (newPrivacy !== CaptionPrivacy.Public) {
    captionCountChange = 0;
  }
  const videoId = newCaption.get("videoId");
  const videoSource = newCaption.get("videoSource");
  const videoQuery = new Parse.Query<VideoSchema>("videos");
  videoQuery.equalTo("sourceId", videoId).equalTo("source", videoSource);

  const video = await videoQuery.first();
  if (video) {
    if (captionCountChange > 0) {
      video.increment("captionCount");
    } else if (captionCountChange < 0) {
      video.decrement("captionCount");
    }
    const captionLanguageCount = video.get("captions") || {};
    const language = newCaption.get("language");
    captionLanguageCount[language] = Math.max(
      0,
      (captionLanguageCount[language] || 0) + captionCountChange
    );
    video.set("captions", captionLanguageCount);
    await video.save(null, { useMasterKey: true });
  }
}

Parse.Cloud.afterSave(
  "captions",
  async (request: Parse.Cloud.AfterSaveRequest) => {
    await updateVideoCaptionCounts(request);
    if (request.object.existed()) {
      // Not new
      return;
    }
    // Add to the captioner's count
    const newCaption = request.object as CaptionSchema;
    const captionerId = newCaption.get("creatorId");

    const query = new Parse.Query<CaptionerSchema>("captioner");
    query.equalTo("userId", captionerId);
    const captioner = await query.first();
    if (!captioner) {
      return undefined;
    }
    captioner.set("lastSubmissionTime", Date.now());
    captioner.increment("captionCount");
    await captioner.save(null, { useMasterKey: true });
  }
);

Parse.Cloud.afterDelete("captions", async (request) => {
  // Subtract from the captioner's count
  const deletedCaption = request.object as CaptionSchema;
  const captionerId = deletedCaption.get("creatorId");
  const query = new Parse.Query<CaptionerSchema>("captioner");
  query.equalTo("userId", captionerId);
  const captioners = await query.find();
  if (!captioners || captioners.length <= 0) {
    return undefined;
  }
  const captioner = captioners[0];
  captioner.decrement("captionCount");
  await captioner.save(null, { useMasterKey: true });

  const videoId = deletedCaption.get("videoId");
  const videoSource = deletedCaption.get("videoSource");
  const videoQuery = new Parse.Query<VideoSchema>("videos");
  videoQuery.equalTo("sourceId", videoId).equalTo("source", videoSource);

  const video = await videoQuery.first();
  if (video) {
    video.decrement("captionCount");
    const captionLanguageCount = video.get("captions") || {};
    const language = deletedCaption.get("language");
    const newCount = Math.max(0, (captionLanguageCount[language] || 0) - 1);
    captionLanguageCount[language] = newCount;
    if (newCount <= 0) {
      // Remove the language from the list
      delete captionLanguageCount[language];
    }
    video.set("captions", captionLanguageCount);
    await video.save(null, { useMasterKey: true });
  }

  // Remove the linked raw file if available
  const file: Parse.File = deletedCaption.get("rawFile");
  if (file) {
    await file.destroy();
  }
});
