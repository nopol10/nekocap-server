/// <reference path="../../../nekocap/src/declarations.d.ts" />
// Above is needed due to references to globalThis in shared imports

// Entry point for Parse cloud code.
// Each import below registers its cloud functions / hooks with Parse as a side effect.
import "./hooks.ts";
import "./migration.ts";
import "./stats.ts";
import "./users/user-apis";
import "./video-apis.ts";
import "./captions/caption-apis";
import "./captions/submit-caption";
import "./captions/update-caption";
import "./captions/like-apis";
import "./captions/review-apis";
import "./captions/list-apis";
import "./users/profile-apis";
import "./users/moderation-apis";
import "./search-apis";
