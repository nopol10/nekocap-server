import type { CaptionsResponse } from "@/common/feature/captioner/types";
import type { BrowseRequest } from "@/common/feature/public-dashboard/types";
import type { CaptionListFields } from "@/common/feature/video/types";
import { CaptionPrivacy } from "@/common/feature/video/types";
import type {
  BrowseResponse,
  CaptionSchema,
} from "@/common/providers/parse/types";
import { PARSE_CLASS } from "../constants";
import { canViewCaption, getRelatedLanguageCodes, isTruthy } from "../utils";
import { captionToListFields } from "./caption-to-list-field";
import { getCaptions } from "./get-captions";

/**
 * Loads the list of latest captions
 */
Parse.Cloud.define(
  "loadLatestCaptions",
  async (): Promise<CaptionsResponse> => {
    const outputSubs = await getCaptions({
      limit: 10,
      offset: 0,
      getRejected: false,
      tags: [],
    });
    return <CaptionsResponse>{
      status: "success",
      captions: outputSubs.result,
    };
  },
);

/**
 * Loads the list of a languages translated to the given language
 * Will return captions from the base and sub languages
 */
Parse.Cloud.define(
  "loadLatestLanguageCaptions",
  async (
    request: Parse.Cloud.FunctionRequest<{ languageCode: string }>,
  ): Promise<CaptionsResponse> => {
    const { languageCode } = request.params;

    // Normalize the language code
    const languageCodes = getRelatedLanguageCodes(languageCode);
    const outputSubs = await getCaptions({
      limit: 10,
      offset: 0,
      getRejected: false,
      languageCodes,
      tags: [],
    });

    return {
      status: "success",
      captions: outputSubs.result,
      hasMore: false,
    };
  },
);

/**
 * Loads popular captions based on likes vs dislike count
 *
 */
Parse.Cloud.define(
  "loadPopularCaptions",
  async (request: Parse.Cloud.FunctionRequest): Promise<CaptionsResponse> => {
    const query = new Parse.Query<CaptionSchema>(PARSE_CLASS.captions);

    query.notEqualTo("rejected", true).greaterThan("likes", 0);
    query.limit(100).descending("likes");

    const captions = await query.find({ useMasterKey: true });
    const outputSubs: CaptionListFields[] = (
      await Promise.all(
        captions.map(async (sub) => {
          if (!canViewCaption(sub, request.user?.id)) {
            return undefined;
          }
          return await captionToListFields(sub);
        }),
      )
    )
      .filter((sub) => {
        if (!sub) {
          return false;
        }
        return sub.likes > sub.dislikes;
      })
      .filter(isTruthy)
      .slice(0, 10);

    return {
      status: "success",
      captions: outputSubs,
      hasMore: false,
    };
  },
);

/**
 * Browse captions
 * Only displays public captions
 */
Parse.Cloud.define(
  "browse",
  async (
    request: Parse.Cloud.FunctionRequest<BrowseRequest>,
  ): Promise<BrowseResponse> => {
    const { limit = 0, offset = 0 } = request.params;
    let { result: captions, hasMore } = await getCaptions({
      limit: Math.min(limit, 100),
      offset,
      getRejected: false,
      tags: [],
    });

    let count: number = 0;
    if (captions.length <= 0 && offset > 0) {
      // Requested offset could be past the last page, try returning the last page
      count = await new Parse.Query<CaptionSchema>(PARSE_CLASS.captions)
        .containedIn("privacy", [undefined, CaptionPrivacy.Public])
        .notEqualTo("rejected", true)
        .count({ useMasterKey: true });
      const overshotCaptionResult = await getCaptions({
        limit: limit,
        offset: count - (count % limit),
        getRejected: false,
        tags: [],
      });
      captions = overshotCaptionResult.result;
      hasMore = overshotCaptionResult.hasMore;
    } else {
      count = offset + captions.length;
    }
    return {
      status: "success",
      captions: captions.slice(0, limit),
      hasMoreResults: hasMore,
      totalCount: count,
    };
  },
);
