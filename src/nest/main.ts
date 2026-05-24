import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import type { Express } from "express";
import { AppModule } from "./app.module";
import { NEST_API_PREFIX } from "./constants";

export async function createNestApp(expressApp: Express): Promise<void> {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    {
      logger: ["log", "warn", "error"],
    },
  );

  app.setGlobalPrefix(NEST_API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors({ origin: true });

  await app.init();
  logger.log(`NestJS sub-app mounted at ${NEST_API_PREFIX}`);
}

module.exports = { createNestApp };
