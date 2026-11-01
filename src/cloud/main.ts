/// <reference path="../../../nekocap/src/declarations.d.ts" />
// Above is needed due to references to globalThis in shared imports
import { CLOUD_FUNCTIONS } from "./cloud-functions";
import "./hooks.ts";
import { getNestBridge, toBridgeContext } from "./nest-bridge";

/**
 * A Parse object returned by the bridge in JSON form
 */
type ParseObjectJSON = { className: string; objectId: string } & Record<
  string,
  unknown
>;

const toParseObject = (json: unknown): Parse.Object | undefined =>
  json ? Parse.Object.fromJSON(json as ParseObjectJSON) : undefined;

/**
 * Responses of these cloud functions used to contain Parse objects, which
 * older clients read with `.get()`. The bridge returns them as JSON so they
 * are turned back into Parse objects here.
 */
const responseTransforms: Record<string, (response: any) => unknown> = {
  loadCaption: (response) => ({
    ...response,
    caption: toParseObject(response.caption),
  }),
  loadCaptionForReview: (response) => ({
    ...response,
    caption: toParseObject(response.caption),
  }),
  search: (response) => ({
    ...response,
    videos: (response.videos || []).map(toParseObject),
  }),
};

for (const name of CLOUD_FUNCTIONS) {
  Parse.Cloud.define(name, async (request: Parse.Cloud.FunctionRequest) => {
    const response = await getNestBridge().run(
      name,
      request.params || {},
      toBridgeContext(request),
    );
    const transform = responseTransforms[name];
    return transform ? transform(response) : response;
  });
}
