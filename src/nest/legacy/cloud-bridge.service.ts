import { Inject, Injectable } from "@nestjs/common";
import { CaptionFeedbackService } from "../captions/caption-feedback.service";
import { CaptionSubmissionService } from "../captions/caption-submission.service";
import { CaptionsService } from "../captions/captions.service";
import { CaptionersService } from "../captioners/captioners.service";
import { MigrationService } from "../migration/migration.service";
import { SearchService } from "../search/search.service";
import type { RequestContext } from "../shared/request-context";
import { GlobalStatsService } from "../stats/global-stats.service";
import { UsersService } from "../users/users.service";
import { VideosService } from "../videos/videos.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = Record<string, any>;

type Handler = (params: Params, ctx: RequestContext) => Promise<unknown>;

/**
 * A Parse object in JSON form. The Parse cloud functions turn these back into
 * Parse.Objects so that old clients, which call `.get()` on them, keep working.
 */
export type LegacyParseObjectJSON = {
  className: string;
  objectId: string;
  [key: string]: unknown;
};

export const NEST_BRIDGE_GLOBAL = "__nekocapNestBridge";

/**
 * Lets the Parse cloud functions (still called by older versions of the
 * extension) run the same NestJS services the REST API uses. Each entry is
 * keyed by the Parse cloud function name and returns exactly what the old
 * cloud function returned, except that Parse objects are returned in JSON form.
 */
@Injectable()
export class CloudBridgeService {
  private readonly handlers: Record<string, Handler>;

  constructor(
    @Inject(CaptionsService) captions: CaptionsService,
    @Inject(CaptionSubmissionService) submissions: CaptionSubmissionService,
    @Inject(CaptionFeedbackService) feedback: CaptionFeedbackService,
    @Inject(CaptionersService) captioners: CaptionersService,
    @Inject(SearchService) search: SearchService,
    @Inject(GlobalStatsService) stats: GlobalStatsService,
    @Inject(VideosService) videos: VideosService,
    @Inject(MigrationService) migration: MigrationService,
    @Inject(UsersService) users: UsersService,
  ) {
    const withClassName = <T extends { objectId: string } | undefined>(
      className: string,
      object: T,
    ): LegacyParseObjectJSON | undefined =>
      object ? { className, ...object } : undefined;

    this.handlers = {
      // Captions
      findCaptions: (p, ctx) => captions.findCaptionsForVideo(p, ctx),
      loadCaption: async (p, ctx) => {
        const response = await captions.loadCaption(p.captionId, ctx);
        return {
          ...response,
          caption: withClassName("captions", response.caption),
        };
      },
      loadCaptionForReview: async (p, ctx) => {
        const response = await captions.loadCaptionForReview(p.captionId, ctx);
        return {
          ...response,
          caption: withClassName("captions", response.caption),
        };
      },
      loadUserCaptions: (p, ctx) => captions.loadUserCaptions(p as never, ctx),
      loadLatestCaptions: () => captions.getLatest(),
      loadLatestLanguageCaptions: (p) =>
        captions.getLatestInLanguage(p.languageCode),
      loadPopularCaptions: (_, ctx) => captions.getPopular(ctx),
      browse: (p) => captions.browse(p),
      submitCaption: (p, ctx) => submissions.submitCaption(p as never, ctx),
      updateCaption: (p, ctx) => submissions.updateCaption(p as never, ctx),
      deleteCaption: (p, ctx) => submissions.deleteCaption(p.captionId, ctx),
      likeCaption: (p, ctx) => feedback.likeCaption(p.captionId, ctx),
      dislikeCaption: (p, ctx) => feedback.dislikeCaption(p.captionId, ctx),
      rejectCaption: (p, ctx) => feedback.rejectCaption(p as never, ctx),
      verifyCaption: (p, ctx) => feedback.verifyCaption(p as never, ctx),
      // Captioners
      loadPrivateCaptionerData: (p, ctx) =>
        captioners.loadPrivateCaptionerData(p, ctx),
      loadProfile: (p, ctx) => captioners.loadProfile(p as never, ctx),
      updateCaptionerProfile: (p, ctx) =>
        captioners.updateCaptionerProfile(p as never, ctx),
      verifyCaptioner: (p, ctx) =>
        captioners.verifyCaptioner(p.targetUserId, ctx),
      banCaptioner: (p, ctx) => captioners.banCaptioner(p.targetUserId, ctx),
      assignReviewerRole: (p, ctx) =>
        captioners.assignReviewerRole(p.targetUserId, ctx),
      assignReviewerManagerRole: (p, ctx) =>
        captioners.assignReviewerManagerRole(p.targetUserId, ctx),
      getOwnProfileTags: (_, ctx) => captioners.getOwnProfileTags(ctx),
      deleteProfileTag: (p, ctx) => captioners.deleteProfileTag(p.tagName, ctx),
      // Search, stats and videos
      search: async (p) => {
        const { docs, hasMoreResults } = await search.searchVideoDocuments(
          p as never,
        );
        return {
          status: "success",
          hasMoreResults,
          videos: docs.map(({ _id, _created_at, _updated_at, ...fields }) => ({
            className: "videos",
            objectId: _id,
            createdAt: _created_at?.toISOString(),
            updatedAt: _updated_at?.toISOString(),
            ...fields,
          })),
        };
      },
      globalStats: () => stats.getGlobalStats(),
      getAutoCaptionList: (p) => videos.getAutoCaptionList(p),
      // Migrations
      createVideo: (p, ctx) => migration.createVideo(p as never, ctx),
      createBatchYoutubeVideos: (p, ctx) =>
        migration.createBatchYoutubeVideos(p, ctx),
      migrationCreateCaptionerWithoutUser: (p, ctx) =>
        migration.createCaptionerWithoutUser(p as never, ctx),
      migrationCreateCaption: (p, ctx) =>
        migration.createCaption(p as never, ctx),
      // Hooks
      ensureCaptionerRecords: (p) => users.ensureCaptionerRecords(p.userId),
    };
  }

  functionNames(): string[] {
    return Object.keys(this.handlers);
  }

  async run(
    name: string,
    params: Params = {},
    ctx: RequestContext = {},
  ): Promise<unknown> {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`Unknown cloud function: ${name}`);
    }
    return handler(params || {}, ctx);
  }
}
