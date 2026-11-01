import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import { timingSafeEqual } from "crypto";
import { NEKOCAP_OPTIONS, type NekoCapOptions } from "../options";
import type { RequestContext } from "../shared/request-context";
import { SessionService } from "./session.service";

type RequestWithContext = Request & { nekocapContext?: RequestContext };

const SESSION_TOKEN_HEADER = "x-parse-session-token";
const MASTER_KEY_HEADER = "x-parse-master-key";

const readSessionToken = (request: Request): string | undefined => {
  const header = request.headers[SESSION_TOKEN_HEADER];
  if (typeof header === "string" && header) {
    return header;
  }
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.substring("Bearer ".length).trim() || undefined;
  }
  return undefined;
};

const safeEqual = (a: string, b: string) => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
};

/**
 * Global guard that works out who is making the request. It never rejects a
 * request: like the Parse cloud functions, each endpoint decides what to do
 * with anonymous requests (usually returning a NOT_LOGGED_IN error).
 */
@Injectable()
export class RequestContextGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(NEKOCAP_OPTIONS) private readonly options: NekoCapOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const requestContext: RequestContext = {};
    const sessionToken = readSessionToken(request);
    if (sessionToken) {
      const sessionUser = await this.sessions.resolve(sessionToken);
      if (sessionUser) {
        requestContext.user = {
          id: sessionUser.userId,
          sessionToken: sessionUser.sessionToken,
        };
      }
    }
    const masterKey = request.headers[MASTER_KEY_HEADER];
    requestContext.master =
      !!this.options.masterKey &&
      typeof masterKey === "string" &&
      safeEqual(masterKey, this.options.masterKey);
    request.nekocapContext = requestContext;
    return true;
  }
}

/**
 * Injects the RequestContext resolved by RequestContextGuard
 */
export const Ctx = createParamDecorator(
  (_: unknown, context: ExecutionContext): RequestContext =>
    context.switchToHttp().getRequest<RequestWithContext>().nekocapContext ||
    {},
);
