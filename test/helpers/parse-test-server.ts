import type { INestApplication } from "@nestjs/common";
import express from "express";
import { Server } from "http";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import path from "node:path";
import { ParseServer } from "parse-server";
import Parse from "parse/node";
import { createNestApp } from "../../src/nest/main";
import type { NekoCapOptions } from "../../src/nest/options";
import { TestIdentityProvider } from "./test-identity-provider";

interface ParseServerInstance {
  app: express.Express;
  start(): Promise<void>;
  handleShutdown(): Promise<void>;
}

const ParseServerCtor = ParseServer as unknown as new (
  options: Record<string, unknown>,
) => ParseServerInstance;

interface TestServer {
  appId: string;
  masterKey: string;
  serverURL: string;
  /** Base url of the NestJS REST API, e.g. http://127.0.0.1:1234/api/v1 */
  apiURL: string;
  parseServer: ParseServerInstance;
  nestApp: INestApplication;
  mongo: MongoMemoryReplSet;
  httpServer: Server;
}

let current: TestServer | undefined;

const APP_ID = "nekocap-test-app";
const MASTER_KEY = "nekocap-test-master";

export class MongoUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "Failed to start an in-memory MongoDB instance — mongodb-memory-server " +
        "could not obtain a mongod binary. The test environment must either " +
        "allow outbound access to fastdl.mongodb.org / repo.mongodb.org, or " +
        "provide a local mongod via the MONGOMS_SYSTEM_BINARY env var. " +
        `Underlying error: ${(cause as Error)?.message ?? String(cause)}`,
    );
    this.name = "MongoUnavailableError";
  }
}

export async function startParseServer(): Promise<TestServer> {
  if (current) {
    return current;
  }

  let mongo: MongoMemoryReplSet;
  try {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
  } catch (err) {
    throw new MongoUnavailableError(err);
  }
  const databaseURI = mongo.getUri();

  const cloudPath = path.resolve(__dirname, "../../src/cloud/main.ts");

  const parseServer = new ParseServerCtor({
    databaseURI,
    cloud: cloudPath,
    appId: APP_ID,
    masterKey: MASTER_KEY,
    maintenanceKey: "test-maintenance",
    masterKeyIps: ["0.0.0.0/0", "::/0"],
    serverURL: "http://127.0.0.1:0/parse",
    allowClientClassCreation: false,
    fileUpload: {
      enableForAuthenticatedUser: true,
      fileExtensions: ["txt", "ass", "srt", "vtt", "ssa", "plain"],
      allowedFileUrlDomains: [],
    },
    liveQuery: { classNames: [] },
    logLevel: "error",
  });

  await parseServer.start();

  const app = express();
  app.use("/parse", parseServer.app);

  // The NestJS app runs in the same express app as Parse, as it does in
  // production. The Parse cloud functions delegate to it.
  const nestOptions: NekoCapOptions = {
    databaseURI,
    appId: APP_ID,
    masterKey: MASTER_KEY,
    // Updated once the server is listening
    publicServerURL: "http://127.0.0.1:0/parse",
    identityProviders: [new TestIdentityProvider()],
    enableSchedule: false,
  };
  const nestApp = await createNestApp(app, nestOptions);

  const httpServer = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind Parse test server to a port");
  }
  const serverURL = `http://127.0.0.1:${address.port}/parse`;
  const apiURL = `http://127.0.0.1:${address.port}/api/v1`;
  nestOptions.publicServerURL = serverURL;

  Parse.initialize(APP_ID, undefined, MASTER_KEY);
  (Parse as unknown as { serverURL: string }).serverURL = serverURL;

  current = {
    appId: APP_ID,
    masterKey: MASTER_KEY,
    serverURL,
    apiURL,
    parseServer,
    nestApp,
    mongo,
    httpServer,
  };
  return current;
}

export function getTestServer(): TestServer {
  if (!current) {
    throw new Error("The test server has not been started");
  }
  return current;
}

export async function stopParseServer(): Promise<void> {
  if (!current) return;
  const { httpServer, parseServer, nestApp, mongo } = current;
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await nestApp.close();
  // parse-server's handleShutdown unconditionally calls `this.server.close`,
  // but `this.server` is never assigned when parse-server is mounted as
  // express middleware (we own the http listener above). Swallow that case.
  try {
    await parseServer.handleShutdown();
  } catch (err) {
    if (!(err instanceof TypeError)) {
      throw err;
    }
  }
  await mongo.stop();
  current = undefined;
}
