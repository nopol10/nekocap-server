import "reflect-metadata";
import { type INestApplication, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Express } from "express";
import { AppModule } from "./app.module";
import { MAX_REQUEST_BODY_SIZE, NEST_API_PREFIX } from "./constants";
import {
  CloudBridgeService,
  NEST_BRIDGE_GLOBAL,
} from "./legacy/cloud-bridge.service";
import { type NekoCapOptions, optionsFromEnv } from "./options";

/**
 * Mounts the NestJS API on the given express app (the same app Parse Server
 * is mounted on) and registers the bridge the Parse cloud functions use to
 * call into NestJS.
 */
export async function createNestApp(
  expressApp: Express,
  options: NekoCapOptions = optionsFromEnv(),
): Promise<INestApplication> {
  const logger = new Logger("Bootstrap");
  // Parse Server parses its own request bodies. Only parse bodies for the
  // API, with the same size limit Parse has for caption uploads.
  expressApp.use(
    NEST_API_PREFIX,
    express.json({ limit: MAX_REQUEST_BODY_SIZE }),
  );
  const app = await NestFactory.create(
    AppModule.forRoot(options),
    new ExpressAdapter(expressApp),
    {
      bodyParser: false,
      logger: ["log", "warn", "error"],
    },
  );

  app.setGlobalPrefix(NEST_API_PREFIX);
  app.enableCors({ origin: true });

  await app.init();
  (globalThis as Record<string, unknown>)[NEST_BRIDGE_GLOBAL] =
    app.get(CloudBridgeService);
  logger.log(`NestJS sub-app mounted at ${NEST_API_PREFIX}`);
  return app;
}
