/**
 * Access to the NestJS services from Parse cloud code.
 *
 * All of NekoCap's business logic lives in the NestJS app (src/nest), which
 * runs in the same process as Parse Server. It registers a bridge on a
 * global when it boots (see src/nest/main.ts); the cloud functions here are
 * thin wrappers kept so that older versions of the extension, which still
 * call Parse cloud functions, keep working.
 */

// Keep in sync with NEST_BRIDGE_GLOBAL in src/nest/legacy/cloud-bridge.service.ts
const NEST_BRIDGE_GLOBAL = "__nekocapNestBridge";

export type BridgeContext = {
  user?: { id: string; sessionToken?: string };
  master?: boolean;
};

export type NestBridge = {
  run(
    name: string,
    params: Record<string, unknown>,
    ctx: BridgeContext,
  ): Promise<unknown>;
  functionNames(): string[];
};

export const getNestBridge = (): NestBridge => {
  const bridge = (globalThis as Record<string, unknown>)[NEST_BRIDGE_GLOBAL];
  if (!bridge) {
    throw new Error("The NestJS app has not been started");
  }
  return bridge as NestBridge;
};

export const toBridgeContext = (request: {
  user?: Parse.User;
  master?: boolean;
}): BridgeContext => {
  const { user, master } = request;
  const sessionToken = user?.getSessionToken() || undefined;
  return {
    user: user && user.id ? { id: user.id, sessionToken } : undefined,
    master: !!master,
  };
};
