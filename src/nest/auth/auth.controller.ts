import { Body, Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import type { LoginResponse, ServerResponse } from "../shared/api-types";
import type { RequestContext } from "../shared/request-context";
import { AuthService } from "./auth.service";
import { Ctx } from "./request-context.guard";

type LoginBody = {
  provider?: string;
  authData?: Record<string, unknown>;
};

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly service: AuthService) {}

  /**
   * Exchanges an identity provider's credentials for a NekoCap session token
   */
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: LoginBody = {}): Promise<LoginResponse> {
    return this.service.login(body.provider, body.authData);
  }

  @Post("link")
  @HttpCode(200)
  async link(
    @Ctx() ctx: RequestContext,
    @Body() body: LoginBody = {},
  ): Promise<ServerResponse> {
    return this.service.link(ctx, body.provider || "", body.authData);
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Ctx() ctx: RequestContext): Promise<ServerResponse> {
    return this.service.logout(ctx);
  }

  @Get("me")
  @HttpCode(200)
  async me(@Ctx() ctx: RequestContext): Promise<LoginResponse> {
    return this.service.me(ctx);
  }
}
