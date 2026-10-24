import { Inject, Injectable, Logger } from "@nestjs/common";
import type { mongo } from "mongoose";
import { USER_COLLECTION } from "../constants";
import { getUserOwnACL } from "../parse-compat/acl";
import type { UserDoc } from "../parse-compat/documents";
import { newObjectId, newUsername } from "../parse-compat/object-id";
import { ParseDbService } from "../parse-compat/parse-db.service";
import type { LoginResponse, ServerResponse } from "../shared/api-types";
import type { RequestContext } from "../shared/request-context";
import { UsersService } from "../users/users.service";
import {
  IDENTITY_PROVIDERS,
  type IdentityProvider,
  InvalidAuthDataError,
} from "./providers/identity-provider";
import { SessionService } from "./session.service";

export const DEFAULT_IDENTITY_PROVIDER = "firebase";

/** Parse stores each auth provider's data on `_User` as `_auth_data_<provider>` */
const authDataKey = (provider: string) => `_auth_data_${provider}`;

const authDataFilter = (provider: string, providerUserId: string) =>
  ({
    [`${authDataKey(provider)}.id`]: providerUserId,
  }) as mongo.Filter<UserDoc>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(IDENTITY_PROVIDERS)
    private readonly identityProviders: IdentityProvider[],
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(ParseDbService) private readonly db: ParseDbService,
  ) {}

  private getProvider(name: string): IdentityProvider | undefined {
    return this.identityProviders.find((provider) => provider.name === name);
  }

  /**
   * Validates the authData with the identity provider, finds or creates the
   * user linked to that identity and starts a new session for them
   */
  async login(
    providerName: string = DEFAULT_IDENTITY_PROVIDER,
    authData: Record<string, unknown> = {},
  ): Promise<LoginResponse> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      return { status: "error", error: "Unsupported login method" };
    }
    let providerUserId: string;
    try {
      ({ providerUserId } = await provider.validate(authData));
    } catch (e) {
      if (e instanceof InvalidAuthDataError) {
        return { status: "error", error: e.message };
      }
      throw e;
    }

    const users = this.db.collection<UserDoc>(USER_COLLECTION);
    const key = authDataKey(provider.name);
    let user = await users.findOne(
      authDataFilter(provider.name, providerUserId),
    );
    const isNewUser = !user;
    if (!user) {
      const userId = newObjectId();
      user = await this.db.create<UserDoc>(
        USER_COLLECTION,
        {
          username: newUsername(),
          [key]: { id: providerUserId },
        } as Omit<UserDoc, "_id">,
        getUserOwnACL(userId),
        userId,
      );
      this.logger.log(`New user ${userId} (${provider.name})`);
    }
    // Also covers users whose captioner records failed to be created before
    await this.users.ensureCaptionerRecords(user._id);

    const sessionToken = await this.sessions.create(user._id, provider.name);
    return {
      status: "success",
      sessionToken,
      userId: user._id,
      username: user.username,
      isNewUser,
    };
  }

  /**
   * Links another identity provider to the logged in user
   */
  async link(
    ctx: RequestContext,
    providerName: string,
    authData: Record<string, unknown> = {},
  ): Promise<ServerResponse> {
    if (!ctx.user) {
      return { status: "error", error: "Not authorized! Please login" };
    }
    const provider = this.getProvider(providerName);
    if (!provider) {
      return { status: "error", error: "Unsupported login method" };
    }
    let providerUserId: string;
    try {
      ({ providerUserId } = await provider.validate(authData));
    } catch (e) {
      if (e instanceof InvalidAuthDataError) {
        return { status: "error", error: e.message };
      }
      throw e;
    }
    const key = authDataKey(provider.name);
    const users = this.db.collection<UserDoc>(USER_COLLECTION);
    const existing = await users.findOne(
      authDataFilter(provider.name, providerUserId),
    );
    if (existing && existing._id !== ctx.user.id) {
      return {
        status: "error",
        error: "This account is already linked to another user.",
      };
    }
    await this.db.updateById<UserDoc>(USER_COLLECTION, ctx.user.id, {
      $set: { [key]: { id: providerUserId } } as Partial<UserDoc>,
    });
    return { status: "success" };
  }

  async logout(ctx: RequestContext): Promise<ServerResponse> {
    if (ctx.user?.sessionToken) {
      await this.sessions.destroy(ctx.user.sessionToken);
    }
    return { status: "success" };
  }

  async me(ctx: RequestContext): Promise<LoginResponse> {
    if (!ctx.user) {
      return { status: "error", error: "Not authorized! Please login" };
    }
    const user = await this.users.findUser(ctx.user.id);
    return {
      status: "success",
      userId: ctx.user.id,
      username: user?.username,
    };
  }
}
