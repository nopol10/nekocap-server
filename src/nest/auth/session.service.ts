import { Inject, Injectable } from "@nestjs/common";
import { SESSION_COLLECTION, USER_COLLECTION } from "../constants";
import type { SessionDoc, UserDoc } from "../parse-compat/documents";
import { newSessionToken } from "../parse-compat/object-id";
import { ParseDbService } from "../parse-compat/parse-db.service";

// Parse Server's default sessionLength (1 year)
const SESSION_LENGTH_MS = 365 * 24 * 60 * 60 * 1000;
// Short lived cache so that a burst of requests doesn't hit MongoDB for every
// one of them. Kept short so that logouts take effect quickly.
const CACHE_TTL_MS = 5 * 1000;
const USER_POINTER_PREFIX = "_User$";

export type SessionUser = {
  userId: string;
  sessionToken: string;
};

/**
 * NekoCap-issued, opaque sessions. They are stored in Parse's `_Session`
 * format so that a session created here is also accepted by Parse Server
 * (and one created by Parse is accepted here). This is the only place that
 * knows how sessions are stored.
 */
@Injectable()
export class SessionService {
  private readonly cache = new Map<
    string,
    { user: SessionUser | null; expiresAt: number }
  >();

  constructor(@Inject(ParseDbService) private readonly db: ParseDbService) {}

  async create(userId: string, authProvider: string): Promise<string> {
    const sessionToken = newSessionToken();
    await this.db.create<SessionDoc>(SESSION_COLLECTION, {
      _session_token: sessionToken,
      _p_user: `${USER_POINTER_PREFIX}${userId}`,
      createdWith: { action: "login", authProvider },
      restricted: false,
      expiresAt: new Date(Date.now() + SESSION_LENGTH_MS),
    });
    return sessionToken;
  }

  async resolve(sessionToken: string): Promise<SessionUser | null> {
    const cached = this.cache.get(sessionToken);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }
    const user = await this.lookup(sessionToken);
    this.cache.set(sessionToken, {
      user,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    if (this.cache.size > 10000) {
      this.pruneCache();
    }
    return user;
  }

  async destroy(sessionToken: string): Promise<void> {
    this.cache.delete(sessionToken);
    await this.db
      .collection<SessionDoc>(SESSION_COLLECTION)
      .deleteOne({ _session_token: sessionToken });
  }

  private async lookup(sessionToken: string): Promise<SessionUser | null> {
    if (!sessionToken) {
      return null;
    }
    const session = await this.db
      .collection<SessionDoc>(SESSION_COLLECTION)
      .findOne({ _session_token: sessionToken });
    if (!session || !session._p_user?.startsWith(USER_POINTER_PREFIX)) {
      return null;
    }
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      return null;
    }
    const userId = session._p_user.substring(USER_POINTER_PREFIX.length);
    const user = await this.db
      .collection<UserDoc>(USER_COLLECTION)
      .findOne({ _id: userId }, { projection: { _id: 1 } });
    if (!user) {
      return null;
    }
    return { userId, sessionToken };
  }

  private pruneCache() {
    const now = Date.now();
    for (const [key, value] of this.cache) {
      if (value.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}
