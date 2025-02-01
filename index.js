const express = require("express");
const compression = require("compression");
const ParseServer = require("parse-server").ParseServer;
const { FirebaseAuthAdapter } = require("parse-server-firebase-auth");
const fs = require("fs");
const dotenv = require("dotenv");
const helmet = require("helmet");
const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");

dotenv.config();
var databaseUri = process.env.DATABASE_URI || "";

if (!databaseUri) {
  console.log("DATABASE_URI not specified, falling back to localhost.");
}

const port = process.env.PORT || 1337;
const internalPort = process.env.PROD
  ? process.env.INTERNAL_PORT || 4042
  : port;

// Replace the port in the server URL for convenience so that we don't have to change the env file to make it work during both development
// and live deployment
let serverURL = process.env.SERVER_URL || "http://localhost:1337/parse";
if (!process.env.PROD && process.env.SERVER_URL && process.env.INTERNAL_PORT) {
  serverURL = process.env.SERVER_URL.replace(
    `:${process.env.INTERNAL_PORT}/`,
    `:${port}/`,
  );
}
let publicServerURL = process.env.PROD
  ? process.env.PUBLIC_SERVER_URL
  : serverURL;

const server = new ParseServer({
  auth: {
    firebase: new FirebaseAuthAdapter(),
    google: {},
  },
  allowHeaders: ["sentry-trace", "baggage"],
  allowClientClassCreation: false,
  databaseURI: databaseUri || "mongodb://localhost:27017/dev",
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + "/cloud.js",
  appId: process.env.APP_ID || "myAppId",
  masterKey: process.env.MASTER_KEY || "",
  masterKeyIps: ["0.0.0.0/0", "::/0"],
  serverURL,
  publicServerURL,
  fileUpload: {
    enableForAuthenticatedUser: true,
    fileExtensions: ["txt", "ass", "srt", "vtt", "ssa", "plain"],
  },
  liveQuery: {
    classNames: [],
  },
  maxUploadSize: "100mb",
  logLevel: "error",
});

const app = express();
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
app.use(helmet());
app.use(compression());

async function start() {
  await server.start();
  var mountPath = process.env.PARSE_MOUNT || "/parse";
  // Serve the Parse API on the /parse URL prefix
  app.use(mountPath, server.app);

  Sentry.init({
    dsn: process.env.BACKEND_SENTRY_DSN,
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // enable Express.js middleware tracing
      new Tracing.Integrations.Express({ app }),
    ],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 0.2,
    enabled: !!process.env.PROD,
  });

  if (process.env.PROD) {
    let httpsServer = require("https").createServer(
      {
        key: fs.readFileSync(process.env.SSL_KEY_PATH, "utf8"),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH, "utf8"),
      },
      app,
    );
    httpsServer.listen(port, function () {
      console.log("NekoCap HTTPS server running on port " + port + ".");
    });
  }
  app.use(Sentry.Handlers.errorHandler());
  // The HTTP server is used to allow cloud code to make calls to the actual parse instance
  // Ideally this will not be exposed by the container.
  const httpServer = require("http").createServer(app);
  httpServer.listen(internalPort, function () {
    console.log("NekoCap server running on port " + internalPort + ".");
  });
}

void start();

// // This will enable the Live Query real-time server
// ParseServer.createLiveQueryServer(httpServer);
