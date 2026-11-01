/// <reference path="../../../nekocap/src/declarations.d.ts" />
// Above is needed due to references to globalThis in shared imports

// Entry point for Parse cloud code.
// Each import below registers its cloud functions / hooks with Parse as a side effect.
// The captions and users folders register their files via their index.ts.
import "./hooks.ts";
import "./migration.ts";
import "./stats.ts";
import "./video-apis.ts";
import "./search-apis";
import "./captions";
import "./users";
