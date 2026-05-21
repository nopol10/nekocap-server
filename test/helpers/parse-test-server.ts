import path from "node:path";
import express from "express";
import type { Server } from "node:http";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ParseServer } from "parse-server";
import Parse from "parse/node";

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
  parseServer: ParseServerInstance;
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

  const httpServer = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind Parse test server to a port");
  }
  const serverURL = `http://127.0.0.1:${address.port}/parse`;

  Parse.initialize(APP_ID, undefined, MASTER_KEY);
  (Parse as unknown as { serverURL: string }).serverURL = serverURL;

  current = {
    appId: APP_ID,
    masterKey: MASTER_KEY,
    serverURL,
    parseServer,
    mongo,
    httpServer,
  };
  return current;
}

export async function stopParseServer(): Promise<void> {
  if (!current) return;
  const { httpServer, parseServer, mongo } = current;
  await new Promise<void>((resolve) =>
    httpServer.close(() => resolve()),
  );
  await parseServer.handleShutdown();
  await mongo.stop();
  current = undefined;
}
