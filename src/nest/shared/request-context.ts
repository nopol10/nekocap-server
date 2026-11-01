/** The authenticated user making a request */
export type AuthUser = {
  id: string;
  sessionToken?: string;
};

/**
 * Who is making a request. Built from the session token of a REST request,
 * or from `request.user` / `request.master` of a legacy Parse cloud function
 * call, so that services behave the same for both.
 */
export type RequestContext = {
  user?: AuthUser;
  /** Whether the request was made with the Parse master key */
  master?: boolean;
};
