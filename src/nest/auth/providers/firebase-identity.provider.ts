import { Logger } from "@nestjs/common";
import * as admin from "firebase-admin";
import path from "path";
import {
  type IdentityProvider,
  InvalidAuthDataError,
  type ValidatedIdentity,
} from "./identity-provider";

const FIREBASE_APP_NAME = "nekocap-nest-auth";

/**
 * Validates Firebase ID tokens, exactly like the parse-server-firebase-auth
 * adapter used by Parse: authData is `{id: <firebase uid>, access_token: <ID token>}`
 */
export class FirebaseIdentityProvider implements IdentityProvider {
  readonly name = "firebase";
  private readonly logger = new Logger(FirebaseIdentityProvider.name);
  private app?: admin.app.App;

  private getApp(): admin.app.App {
    if (this.app) {
      return this.app;
    }
    const existing = admin.apps.find((app) => app?.name === FIREBASE_APP_NAME);
    this.app =
      existing ||
      admin.initializeApp(
        { credential: admin.credential.cert(this.credentials()) },
        FIREBASE_APP_NAME,
      );
    return this.app;
  }

  /**
   * FIREBASE_SERVICE_ACCOUNT is either the service account JSON itself or a
   * path to it, same as for parse-server-firebase-auth
   */
  private credentials(): Record<string, string> {
    const data = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!data) {
      throw new Error("Missing required env var: FIREBASE_SERVICE_ACCOUNT");
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.resolve(".", data));
    }
  }

  async validate(
    authData: Record<string, unknown>,
  ): Promise<ValidatedIdentity> {
    const { id, access_token: accessToken } = authData;
    if (typeof id !== "string" || typeof accessToken !== "string") {
      throw new InvalidAuthDataError("Firebase auth data is incomplete.");
    }
    let decodedToken;
    try {
      decodedToken = await this.getApp().auth().verifyIdToken(accessToken);
    } catch (e) {
      this.logger.warn(`Firebase token verification failed: ${e}`);
      throw new InvalidAuthDataError("Firebase auth is invalid for this user.");
    }
    if (!decodedToken || decodedToken.uid !== id) {
      throw new InvalidAuthDataError("Firebase auth not found for this user.");
    }
    return {
      providerUserId: id,
      email: decodedToken.email,
      displayName: decodedToken.name,
    };
  }
}
