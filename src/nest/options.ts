import type { LogLevel } from "@nestjs/common";
import type { IdentityProvider } from "./auth/providers/identity-provider";

export const NEKOCAP_OPTIONS = Symbol("NEKOCAP_OPTIONS");

export type NekoCapOptions = {
  databaseURI: string;
  /** Parse application id, used to build Parse compatible file urls */
  appId: string;
  /** Parse master key, required by the migration endpoints */
  masterKey: string;
  /**
   * Publicly reachable Parse server url (e.g. https://api.example.com/parse).
   * Raw caption files are still served by Parse's files route.
   */
  publicServerURL: string;
  /**
   * Replaces the default identity providers (Firebase). Mainly for tests.
   */
  identityProviders?: IdentityProvider[];
  /** Whether scheduled jobs (e.g. homepage stats) should run */
  enableSchedule?: boolean;
  logLevels?: LogLevel[];
};

/**
 * Resolves the options from the same environment variables index.js uses to
 * configure Parse Server.
 */
export const optionsFromEnv = (): NekoCapOptions => {
  const port = process.env.PORT || 1337;
  let serverURL = process.env.SERVER_URL || "http://localhost:1337/parse";
  if (
    !process.env.PROD &&
    process.env.SERVER_URL &&
    process.env.INTERNAL_PORT
  ) {
    serverURL = process.env.SERVER_URL.replace(
      `:${process.env.INTERNAL_PORT}/`,
      `:${port}/`,
    );
  }
  const publicServerURL =
    (process.env.PROD ? process.env.PUBLIC_SERVER_URL : serverURL) || serverURL;
  return {
    databaseURI: process.env.DATABASE_URI || "mongodb://localhost:27017/dev",
    appId: process.env.APP_ID || "myAppId",
    masterKey: process.env.MASTER_KEY || "",
    publicServerURL,
    enableSchedule: true,
  };
};
