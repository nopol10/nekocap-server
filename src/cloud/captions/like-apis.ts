import type { LoadPrivateCaptionerDataResponse } from "@/common/feature/captioner/types";
import type {
  CaptionLikesSchema,
  CaptionSchema,
} from "@/common/providers/parse/types";
import { getAdminACL } from "../acl";
import { isInMaintenanceMode } from "../config";
import { ERROR_MESSAGES, PARSE_CLASS } from "../constants";

const createCaptionLikesObject = async (
  user: Parse.User,
): Promise<CaptionLikesSchema> => {
  const CaptionLikes = Parse.Object.extend(
    PARSE_CLASS.captionLikes,
  ) as new () => CaptionLikesSchema;
  const captionLikes = new CaptionLikes();
  captionLikes.set("userId", user.id);
  captionLikes.set("likes", []);
  captionLikes.set("dislikes", []);
  captionLikes.setACL(getAdminACL());
  await captionLikes.save(null, {
    sessionToken: user.getSessionToken() ?? undefined,
  });
  return captionLikes;
};

/**
 * Called when a user likes a caption
 * 0. Check whether user has an entry in the captionLikes class, if not create one
 * 1. Get the user's likes and dislikes array from the captionLikes class
 * 2. If the caption id is already in the likes array, remove it and END
 * 3. If the caption id is in the dislikes array
 *  a. Remove it from the dislikes array
 *  b. Remove a dislike from the caption
 * 4. Add it to the likes array
 * 5. Add a like to the caption
 */
Parse.Cloud.define(
  "likeCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>,
  ): Promise<LoadPrivateCaptionerDataResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { captionId: captionId } = request.params;

    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    query.equalTo("objectId", captionId);
    const captions = await query.find({ useMasterKey: true });
    if (!captions || captions.length <= 0) {
      // Try to like a caption that doesn't exist
      return { status: "error", error: "No such caption" };
    }

    const userId = request.user.id;
    const caption = captions[0];
    if (caption.get("creatorId") === userId) {
      // Can't like your own caption
      return { status: "error", error: "Can't like your own caption!" };
    }

    const likesQuery = new Parse.Query<CaptionLikesSchema>(
      PARSE_CLASS.captionLikes,
    );
    likesQuery.equalTo("userId", userId);
    const likesObjects = await likesQuery.find({ useMasterKey: true });
    let likesObject: CaptionLikesSchema;

    if (!likesObjects || likesObjects.length <= 0) {
      likesObject = await createCaptionLikesObject(request.user);
    } else {
      likesObject = likesObjects[0];
    }
    let likes: string[] = likesObject.get("likes") || [];
    if (likes.includes(captionId)) {
      // User already likes this caption, unlike it
      likesObject.remove("likes", captionId);
      caption.decrement("likes");
    } else {
      let dislikes: string[] = likesObject.get("dislikes") || [];
      if (dislikes.includes(captionId)) {
        likesObject.remove("dislikes", captionId);
        caption.decrement("dislikes");
      }

      likesObject.addUnique("likes", captionId);
      caption.increment("likes");
    }

    await likesObject.save(null, { useMasterKey: true });
    // Save with master key as only the caption creator (and admins) can modify a caption object
    await caption.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  },
);

/**
 * Called when a user dislikes a caption
 * 0. Check whether user has an entry in the captionLikes class, if not create one
 * 1. Get the user's likes and dislikes array from the captionLikes class
 * 2. If the caption id is already in the dislikes array, remove it and END
 * 3. If the caption id is in the likes array
 *  a. Remove it from the likes array
 *  b. Remove a like from the caption
 * 4. Add it to the dislikes array
 * 5. Add a dislike to the caption
 */
Parse.Cloud.define(
  "dislikeCaption",
  async (
    request: Parse.Cloud.FunctionRequest<{ captionId: string }>,
  ): Promise<LoadPrivateCaptionerDataResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { captionId } = request.params;

    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    query.equalTo("objectId", captionId);
    const captions = await query.find({ useMasterKey: true });
    if (!captions || captions.length <= 0) {
      // Try to like a caption that doesn't exist
      return { status: "error", error: "No such caption" };
    }

    const userId = request.user.id;
    const caption = captions[0];
    if (caption.get("creatorId") === userId) {
      // Can't dislike your own caption
      return { status: "error", error: "Can't like your own caption!" };
    }

    const likesQuery = new Parse.Query<CaptionLikesSchema>(
      PARSE_CLASS.captionLikes,
    );
    likesQuery.equalTo("userId", userId);
    const likesObjects = await likesQuery.find({ useMasterKey: true });
    let likesObject: CaptionLikesSchema;
    if (!likesObjects || likesObjects.length <= 0) {
      likesObject = await createCaptionLikesObject(request.user);
    } else {
      likesObject = likesObjects[0];
    }
    let dislikes: string[] = likesObject.get("dislikes") || [];
    if (dislikes.includes(captionId)) {
      // User already likes this caption, get out with success as nothing has really "gone wrong"
      likesObject.remove("dislikes", captionId);
      caption.decrement("dislikes");
    } else {
      let likes: string[] = likesObject.get("likes") || [];
      if (likes.includes(captionId)) {
        likesObject.remove("likes", captionId);
        caption.decrement("likes");
      }

      likesObject.add("dislikes", captionId);
      caption.increment("dislikes");
    }

    await likesObject.save(null, { useMasterKey: true });
    // Save with master key as only the caption creator (and admins) can modify a caption object
    await caption.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  },
);
