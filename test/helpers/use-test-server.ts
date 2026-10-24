import Parse from "parse/node";
import { afterAll, beforeAll, beforeEach, type TestContext } from "vitest";
import { resetCollections } from "./fixtures";
import {
  MongoUnavailableError,
  startParseServer,
  stopParseServer,
} from "./parse-test-server";

/**
 * Starts the Parse + NestJS test server for the enclosing describe block and
 * resets the data before each test. Tests should call `skipIfNoServer(ctx)`
 * first so they are skipped when MongoDB can't be started.
 */
export const useTestServer = (label: string) => {
  let skipReason: string | undefined;

  beforeAll(async () => {
    try {
      await startParseServer();
    } catch (err) {
      if (err instanceof MongoUnavailableError) {
        skipReason = err.message;
        console.warn(`[${label}] skipping: ${err.message}`);
        return;
      }
      throw err;
    }
  });

  afterAll(async () => {
    if (!skipReason) await stopParseServer();
  });

  beforeEach(async () => {
    if (skipReason) return;
    await resetCollections();
    await Parse.Config.save({ maintenance: false }, {});
  });

  return {
    skipIfNoServer: (ctx: TestContext) => {
      if (skipReason) ctx.skip(skipReason);
    },
  };
};
