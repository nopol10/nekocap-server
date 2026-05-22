/**
 * Parse Cloud Code type definitions.
 *
 * `@types/parse` ships a `Parse.Cloud` namespace, but those typings describe
 * the client SDK: they omit several trigger-registration functions and only
 * approximate the request objects parse-server passes to Cloud Code handlers.
 *
 * This file augments `Parse.Cloud` to match the server-side API as implemented
 * in parse-community/parse-server (`src/cloud-code/Parse.Cloud.js` and
 * `src/triggers.js`), targeting parse-server 9.x — the version this project
 * runs (see `package.json`).
 *
 * Augmented interfaces only ADD members via declaration merging; fields are
 * declared optional so the merge never conflicts with `@types/parse` and so
 * code that builds partial request objects (tests, mocks) keeps compiling.
 */
/// <reference types="parse" />
export {};

declare global {
  namespace Parse {
    namespace Cloud {
      /** Logger handed to handlers as `request.log`. */
      interface CloudCodeLogger {
        info(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
        debug(...args: unknown[]): void;
        verbose(...args: unknown[]): void;
      }

      /** Raw HTTP request headers forwarded to handlers as `request.headers`. */
      type CloudCodeHeaders = Record<string, string | string[] | undefined>;

      /**
       * parse-server `Config` exposed as `request.config`. Typed loosely
       * because it is an internal server structure with no stable contract.
       */
      type CloudCodeConfig = Record<string, unknown>;

      /** Mutable object shared between the triggers of a single request. */
      type CloudCodeContext = Record<string, unknown>;

      /**
       * Rate-limit options accepted on a {@link Validator} `rateLimit` field.
       * Mirrors parse-server's `RateLimitOptions`.
       */
      interface ValidatorRateLimitOptions {
        requestTimeWindow?: number;
        requestCount?: number;
        errorResponseMessage?: string;
        includeInternalRequests?: boolean;
        includeMasterKey?: boolean;
        redisUrl?: string;
      }

      /**
       * Legacy callback-style response object. Modern Cloud Code is
       * promise-based and resolves a value instead of calling these, but
       * parse-server still documents the shape.
       */
      interface FunctionResponse {
        success(result?: unknown): void;
        error(error?: string | Error): void;
        status(code: number): FunctionResponse;
        header(name: string, value?: string): FunctionResponse;
      }

      // --- Validator -------------------------------------------------------
      // `@types/parse` already declares requireUser/requireMaster/fields/etc.
      interface Validator {
        /** Per-function rate limiting applied before the handler runs. */
        rateLimit?: ValidatorRateLimitOptions;
      }

      // --- Cloud Function request -----------------------------------------
      // `@types/parse` already declares installationId/master/params/user.
      interface FunctionRequest<T extends Params = Params> {
        /** True when the request authenticated with the read-only master key. */
        isReadOnly?: boolean;
        /** IP address of the client that issued the request. */
        ip?: string;
        /** Raw HTTP headers of the request. */
        headers?: CloudCodeHeaders;
        /** Cloud Code logger. */
        log?: CloudCodeLogger;
        /** Name of the Cloud Function being executed. */
        functionName?: string;
        /** Object shared across the triggers run for this request. */
        context?: CloudCodeContext;
        /** parse-server Config for the request. */
        config?: CloudCodeConfig;
      }

      // --- Job request -----------------------------------------------------
      // `@types/parse` already declares params/message.
      interface JobRequest<T extends Params = Params> {
        /** Name of the job being executed. */
        jobName?: string;
        ip?: string;
        headers?: CloudCodeHeaders;
        log?: CloudCodeLogger;
        config?: CloudCodeConfig;
      }

      // --- Generic trigger request ----------------------------------------
      // `@types/parse` already declares installationId/master/user/ip/headers/
      // triggerName/log/object/original.
      interface TriggerRequest<T = Object> {
        /** True when the request authenticated with the read-only master key. */
        isReadOnly?: boolean;
        /** True for auth-adapter challenge requests (beforeLogin). */
        isChallenge?: boolean;
        /** Object shared across the triggers run for this request. */
        context?: CloudCodeContext;
        /** parse-server Config for the request. */
        config?: CloudCodeConfig;
      }

      // --- Save/delete trigger requests -----------------------------------
      // `@types/parse` declares `context` on Before/AfterSaveRequest only;
      // parse-server also forwards `config` (and `context` on delete triggers,
      // inherited from the TriggerRequest augmentation above).
      interface BeforeSaveRequest<T = Object> {
        config?: CloudCodeConfig;
      }
      interface AfterSaveRequest<T = Object> {
        config?: CloudCodeConfig;
      }
      interface BeforeDeleteRequest<T = Object> {
        config?: CloudCodeConfig;
      }
      interface AfterDeleteRequest<T = Object> {
        config?: CloudCodeConfig;
      }

      // --- Find trigger requests ------------------------------------------
      // `@types/parse` declares query/count/isGet/readPreference on
      // BeforeFindRequest and `objects` on AfterFindRequest.
      interface BeforeFindRequest<T extends Object = Object> {
        config?: CloudCodeConfig;
      }
      interface AfterFindRequest<T = Object> {
        config?: CloudCodeConfig;
        /**
         * Results of the query. parse-server names this `results`; the SDK
         * typings call it `objects`. Both refer to the same array.
         */
        results?: T[];
      }

      // --- File trigger request -------------------------------------------
      // `@types/parse` declares file/fileSize/contentLength.
      interface FileTriggerRequest {
        config?: CloudCodeConfig;
        /** afterFind file trigger: force the file to download. */
        forceDownload?: boolean;
        /** afterFind file trigger: extra headers for the file response. */
        responseHeaders?: Record<string, string>;
      }

      /**
       * Request passed to `beforeConnect` handlers and the basis for
       * LiveQuery connection triggers. Mirrors parse-server's
       * `ConnectTriggerRequest`.
       */
      interface ConnectTriggerRequest {
        event?: string;
        installationId?: string;
        useMasterKey?: boolean;
        user?: User;
        sessionToken?: string;
        clients?: number;
        subscriptions?: number;
        log?: CloudCodeLogger;
      }

      /** Request passed to `beforeSubscribe` handlers. */
      interface BeforeSubscribeRequest<T extends Object = Object>
        extends TriggerRequest<T> {
        /** The subscription query; the handler may constrain it. */
        query: Query<T>;
        sessionToken?: string;
      }

      /** Request passed to `afterLiveQueryEvent` handlers. */
      interface LiveQueryEventTrigger<T extends Object = Object>
        extends TriggerRequest<T> {
        /** The LiveQuery event that fired. */
        event: 'create' | 'enter' | 'update' | 'leave' | 'delete';
        /** Number of connected LiveQuery clients. */
        clients: number;
        /** Number of active subscriptions. */
        subscriptions: number;
        /** Set to false inside the handler to suppress sending the event. */
        sendEvent: boolean;
        sessionToken?: string;
      }

      /** Info object passed to `onLiveQueryEvent` handlers. */
      interface LiveQueryEventHandlerInfo {
        event:
          | 'ws_connect'
          | 'ws_disconnect'
          | 'connect'
          | 'subscribe'
          | 'unsubscribe'
          | 'processEvent';
        client?: unknown;
        sessionToken?: string;
        useMasterKey?: boolean;
        installationId?: string;
        clients?: number;
        subscriptions?: number;
        error?: unknown;
        object?: Object;
      }

      /**
       * Generic, fully-typed Cloud Function registration. Adds an overload to
       * the ones in `@types/parse` so a handler can infer both its params (P)
       * and its resolved return type (R).
       */
      function define<P extends Params = Params, R = unknown>(
        name: string,
        handler: (request: FunctionRequest<P>) => Promise<R> | R,
        validator?: Validator | ((request: FunctionRequest<P>) => unknown),
      ): void;

      /** Runs before a LiveQuery client connects. */
      function beforeConnect(
        handler: (request: ConnectTriggerRequest) => Promise<void> | void,
        validator?: Validator | ((request: ConnectTriggerRequest) => unknown),
      ): void;

      /** Runs before a LiveQuery subscription is created. */
      function beforeSubscribe<T extends Object = Object>(
        parseClass: string | (new () => T),
        handler: (request: BeforeSubscribeRequest<T>) => Promise<void> | void,
        validator?:
          | Validator
          | ((request: BeforeSubscribeRequest<T>) => unknown),
      ): void;

      /** Runs after a LiveQuery event, before it is sent to clients. */
      function afterLiveQueryEvent<T extends Object = Object>(
        parseClass: string | (new () => T),
        handler: (request: LiveQueryEventTrigger<T>) => Promise<void> | void,
        validator?:
          | Validator
          | ((request: LiveQueryEventTrigger<T>) => unknown),
      ): void;

      /** Registers a listener for LiveQuery server lifecycle events. */
      function onLiveQueryEvent(
        handler: (info: LiveQueryEventHandlerInfo) => void,
      ): void;

      /** Runs before a password-reset email is sent. */
      function beforePasswordResetRequest(
        handler: (request: TriggerRequest<User>) => Promise<void> | void,
        validator?: Validator | ((request: TriggerRequest<User>) => unknown),
      ): void;

      /** Sends an email through the configured email adapter. */
      function sendEmail(data: Record<string, unknown>): Promise<unknown>;
    }
  }
}
