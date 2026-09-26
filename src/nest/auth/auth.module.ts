import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NEKOCAP_OPTIONS, type NekoCapOptions } from "../options";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { FirebaseIdentityProvider } from "./providers/firebase-identity.provider";
import { IDENTITY_PROVIDERS } from "./providers/identity-provider";
import { RequestContextGuard } from "./request-context.guard";
import { SessionService } from "./session.service";

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    SessionService,
    AuthService,
    {
      // Register new login methods here
      provide: IDENTITY_PROVIDERS,
      useFactory: (options: NekoCapOptions) =>
        options.identityProviders || [new FirebaseIdentityProvider()],
      inject: [NEKOCAP_OPTIONS],
    },
    { provide: APP_GUARD, useClass: RequestContextGuard },
  ],
  exports: [SessionService, AuthService],
})
export class AuthModule {}
