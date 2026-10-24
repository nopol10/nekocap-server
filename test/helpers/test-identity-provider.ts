import {
  type IdentityProvider,
  InvalidAuthDataError,
  type ValidatedIdentity,
} from "../../src/nest/auth/providers/identity-provider";

/**
 * Stands in for Firebase in tests. An access token of `valid:<id>` proves the
 * identity `<id>`.
 */
export class TestIdentityProvider implements IdentityProvider {
  constructor(readonly name: string = "firebase") {}

  async validate(
    authData: Record<string, unknown>,
  ): Promise<ValidatedIdentity> {
    const { id, access_token: accessToken } = authData;
    if (typeof id !== "string" || accessToken !== `valid:${id}`) {
      throw new InvalidAuthDataError("Firebase auth is invalid for this user.");
    }
    return { providerUserId: id };
  }
}

export const validAuthData = (id: string) => ({
  id,
  access_token: `valid:${id}`,
});
