export const IDENTITY_PROVIDERS = Symbol("IDENTITY_PROVIDERS");

export type ValidatedIdentity = {
  /** The user's id in the identity provider, stored as authData.<provider>.id */
  providerUserId: string;
  email?: string;
  displayName?: string;
};

/**
 * An external identity provider that can prove who a user is at login.
 * NekoCap issues its own session after a successful validation, so the rest
 * of the API never deals with provider specific tokens.
 *
 * To support a new login method, implement this interface and register it in
 * AuthModule's IDENTITY_PROVIDERS. Users are linked to a provider by
 * `authData.<name>.id` on `_User` (Parse's `_auth_data_<name>` field), the
 * same way Parse Server's auth adapters link them, so a single user can be
 * linked to multiple providers.
 */
export interface IdentityProvider {
  /** The authData key, e.g. "firebase" */
  readonly name: string;
  /**
   * Validates the provider specific authData sent by the client.
   * Must throw InvalidAuthDataError when the authData does not prove the
   * identity.
   */
  validate(authData: Record<string, unknown>): Promise<ValidatedIdentity>;
}

export class InvalidAuthDataError extends Error {
  constructor(message = "Invalid authentication data") {
    super(message);
    this.name = "InvalidAuthDataError";
  }
}
