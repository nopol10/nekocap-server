import {
  DeleteProfileTagParams,
  DeleteProfileTagResponse,
  GetOwnProfileTagsResponse,
} from "@/common/feature/profile/types";
import throttledQueue from "throttled-queue";
import { CaptionerSchema, CaptionSchema } from "@/common/providers/parse/types";
import { ERROR_MESSAGES, PARSE_CLASS } from "cloud/constants";
import { getCaptionCount, getCaptions } from "cloud/captions/get-captions";

Parse.Cloud.define(
  "getOwnProfileTags",
  async (
    request: Parse.Cloud.FunctionRequest<{}>
  ): Promise<GetOwnProfileTagsResponse> => {
    const { user } = request;
    if (!user || !user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    const creatorId = user.id;

    const captionerQuery = new Parse.Query<CaptionerSchema>(
      PARSE_CLASS.captioner
    );
    captionerQuery.equalTo("userId", creatorId);
    const captioner = await captionerQuery.first();
    if (!captioner) {
      return;
    }
    const existingTags: string[] = captioner.get("captionTags") || [];
    const throttle = throttledQueue(5, 400);
    const tagDetails = await Promise.all(
      existingTags.map((tag) =>
        throttle(async () => {
          const count = await getCaptionCount({
            limit: -1,
            tags: [tag],
            offset: 0,
            getRejected: true,
            userId: creatorId,
            captionerId: creatorId,
          });
          return { tag: tag, count: count };
        })
      )
    );
    return { status: "success", tags: tagDetails };
  }
);

/**
 * Delete a tag with the specified name
 * The provided tag must contain just the name portion of the tag and not the entire string
 * with the color code.
 */
Parse.Cloud.define(
  "deleteProfileTag",
  async (
    request: Parse.Cloud.FunctionRequest<DeleteProfileTagParams>
  ): Promise<DeleteProfileTagResponse> => {
    const { user } = request;
    if (!user || !user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    const creatorId = user.id;

    const { tagName } = request.params;
    const captionerQuery = new Parse.Query<CaptionerSchema>(
      PARSE_CLASS.captioner
    );
    captionerQuery.equalTo("userId", creatorId);
    const captioner = await captionerQuery.first();
    if (!captioner) {
      return;
    }
    // Remove the tag from the profile
    const existingTags: string[] = captioner.get("captionTags") || [];
    const updatedTags = existingTags.filter((tag) => {
      return tag.indexOf(`g:${tagName}:`) < 0;
    });
    captioner.set("captionTags", updatedTags);

    // Remove tag from all of the user's captions with the tag
    const captionQuery = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);
    captionQuery.equalTo("creatorId", creatorId);
    const userCaptions = captionQuery.findAll({ useMasterKey: true });
    const captions: CaptionSchema[] = (await userCaptions)
      .map((caption) => {
        const tags: string[] | undefined = caption.get("tags");

        const hasTag =
          tags?.some((tag) => {
            return tag.indexOf(`g:${tagName}:`) >= 0;
          }) || false;
        if (!hasTag) {
          return undefined;
        }
        const updatedCaptionTags = tags.filter((tag) => {
          return tag.indexOf(`g:${tagName}:`) < 0;
        });
        const modifiedCaption =
          caption.set("tags", updatedCaptionTags) || undefined;
        return modifiedCaption;
      })
      .filter(Boolean);
    await Parse.Object.saveAll([...captions, captioner], {
      useMasterKey: true,
    });
    return { status: "success" };
  }
);
