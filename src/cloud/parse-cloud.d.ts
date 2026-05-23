/**
 * Parse Cloud Code type definitions.
 *
 * The `parse` npm package ships its server-side Cloud Code types in
 * `parse/types/CloudCode.d.ts`, but the public `parse` entry only re-exports
 * the client-side `Parse.Cloud` surface (`run`, `getJobsData`, ...). The
 * server-side types (`FunctionRequest`, `beforeSave`, etc.) are exposed only
 * through `parse/node`, which the cloud code does not import — cloud handlers
 * reach `Parse.Cloud.*` via the global that parse-server installs at runtime.
 *
 * This file fills that gap by declaring the server-side Cloud Code API on the
 * global `Parse.Cloud` namespace, mirroring `parse/types/CloudCode.d.ts`
 * (and `parse-community/parse-server` `src/cloud-code/Parse.Cloud.js` and
 * `src/triggers.js`) for parse-server 9.x. References to `Parse.Object`,
 * `Parse.User`, `Parse.File`, `Parse.Query` resolve through parse's UMD
 * `export as namespace Parse`.
 */
/// <reference types="parse" />
/// <reference types="node" />
export {};

declare global {
  namespace Parse {
    namespace Cloud {
      // === Helper types ==================================================

      /** Resolves to `R` or a promise of `R`; the return contract for handlers. */
      type TriggerResult<R = void> = R | Promise<R>;

      /** A Parse class accepted by a trigger registration. */
      type TriggerClass<T> = string | (new (...args: any[]) => T);

      /** Validator argument accepted as the last parameter of every trigger. */
      type ValidatorOrHandler<Req> =
        | ValidatorObject
        | ((request: Req) => unknown);

      // === Validator =====================================================

      interface ValidatorField {
        type?: any;
        constant?: boolean;
        default?: any;
        options?: any[] | (() => any[]) | any;
        required?: boolean;
        error?: string;
      }

      interface ValidatorRateLimitOptions {
        requestPath?: string;
        requestMethods?: string | string[];
        requestTimeWindow?: number;
        requestCount?: number;
        errorResponseMessage?: string;
        includeInternalRequests?: boolean;
        includeMasterKey?: boolean;
      }

      interface ValidatorObject {
        requireUser?: boolean;
        requireMaster?: boolean;
        validateMasterKey?: boolean;
        skipWithMasterKey?: boolean;
        requireAnyUserRoles?: string[] | (() => string[]);
        requireAllUserRoles?: string[] | (() => string[]);
        requireUserKeys?: string[] | Record<string, ValidatorField>;
        fields?: string[] | Record<string, ValidatorField>;
        rateLimit?: ValidatorRateLimitOptions;
      }

      /** Legacy alias for {@link ValidatorObject}; kept for `@types/parse` compatibility. */
      type Validator = ValidatorObject;

      // === Request objects ==============================================

      interface FunctionRequest<T = Record<string, any>> {
        /** Set when the request was made from an installed app. */
        installationId?: string;
        /** True when the request was made with the master key. */
        master: boolean;
        /** True when the request authenticated with the read-only master key. */
        isReadOnly?: boolean;
        /** The user that made the request, if any. */
        user?: User;
        /** Params passed to the cloud function. */
        params: T;
        /** Client IP address. */
        ip: string;
        /** Raw HTTP request headers. */
        headers: Record<string, string>;
        /** Cloud Code logger. */
        log: any;
        /** Name of the cloud function being executed. */
        functionName: string;
        /** Mutable object shared between triggers run for this request. */
        context: Record<string, unknown>;
        /** parse-server Config for the request. */
        config: any;
      }

      /** Legacy callback-style response (parse-server still documents the shape). */
      interface FunctionResponse {
        success(result?: unknown): void;
        error(error?: string | Error): void;
        status(code: number): FunctionResponse;
        header(name: string, value: string): FunctionResponse;
      }

      interface TriggerRequest<T extends Object = Object> {
        installationId?: string;
        master: boolean;
        isReadOnly?: boolean;
        /** True for auth-adapter challenge requests (beforeLogin). */
        isChallenge?: boolean;
        user?: User;
        /** The object triggering the hook. */
        object: T;
        /** The object as currently stored, before changes. */
        original?: T;
        ip: string;
        headers: Record<string, string>;
        triggerName: string;
        log: any;
        context: Record<string, unknown>;
        config: any;
      }

      type BeforeSaveRequest<T extends Object = Object> = TriggerRequest<T>;
      type AfterSaveRequest<T extends Object = Object> = TriggerRequest<T>;
      type BeforeDeleteRequest<T extends Object = Object> = TriggerRequest<T>;
      type AfterDeleteRequest<T extends Object = Object> = TriggerRequest<T>;

      interface BeforeFindRequest<T extends Object = Object> {
        installationId?: string;
        master: boolean;
        isReadOnly?: boolean;
        user?: User;
        /** The query being executed. The handler may mutate it or return a replacement. */
        query: Query<T>;
        ip: string;
        headers: Record<string, string>;
        triggerName: string;
        log: any;
        config: any;
        context: Record<string, unknown>;
        isGet: boolean;
        readPreference?: string;
        count?: boolean;
      }

      interface AfterFindRequest<T extends Object = Object> {
        installationId?: string;
        master: boolean;
        isReadOnly?: boolean;
        user?: User;
        query: Query<T>;
        /** Results returned by the query. The handler may return a replacement array. */
        results: T[];
        /** Alias for `results` — parse-server historically exposed both names. */
        objects?: T[];
        ip: string;
        headers: Record<string, string>;
        triggerName: string;
        log: any;
        config: any;
        context: Record<string, unknown>;
      }

      interface FileTriggerRequest {
        installationId?: string;
        master: boolean;
        isReadOnly?: boolean;
        user?: User;
        file: File;
        fileSize: number;
        contentLength: number;
        ip: string;
        headers: Record<string, string>;
        triggerName: string;
        log: any;
        config: any;
        /** afterFind file trigger: force the file to download. */
        forceDownload?: boolean;
        /** afterFind file trigger: extra headers for the file response. */
        responseHeaders?: Record<string, string>;
      }

      interface ConnectTriggerRequest {
        installationId?: string;
        useMasterKey: boolean;
        user?: User;
        clients: number;
        subscriptions: number;
        sessionToken?: string;
      }

      interface LiveQueryEventTrigger<T extends Object = Object> {
        installationId?: string;
        useMasterKey: boolean;
        user?: User;
        sessionToken?: string;
        event: 'create' | 'enter' | 'update' | 'leave' | 'delete' | string;
        object: T;
        original?: T;
        clients: number;
        subscriptions: number;
        /** Set to `false` in the handler to suppress sending the event. */
        sendEvent: boolean;
      }

      /** Info object passed to `onLiveQueryEvent` lifecycle handlers. */
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

      interface JobRequest<T = Record<string, any>> {
        params: T;
        message: (message: string) => void;
        jobName?: string;
        ip?: string;
        headers?: Record<string, string>;
        log?: any;
        config: any;
      }

      // === HTTPRequest (legacy but still exposed by parse-server) =========

      interface HTTPOptions {
        body?: string | object;
        error?: (response: HTTPResponse) => void;
        followRedirects?: boolean;
        headers?: Record<string, string>;
        method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS';
        params?: string | Record<string, string>;
        success?: (response: HTTPResponse) => void;
        url: string;
      }

      interface HTTPResponse {
        buffer?: Buffer;
        cookies?: Record<string, any>;
        data?: any;
        headers?: Record<string, string>;
        status: number;
        text?: string;
      }

      enum ReadPreferenceOption {
        Primary = 'PRIMARY',
        PrimaryPreferred = 'PRIMARY_PREFERRED',
        Secondary = 'SECONDARY',
        SecondaryPreferred = 'SECONDARY_PREFERRED',
        Nearest = 'NEAREST',
      }

      // === Trigger & function registration ===============================

      /**
       * Registers a Cloud Function. The handler can infer both its params
       * (`T`) and its resolved return type.
       */
      function define<T = Record<string, any>>(
        name: string,
        handler: (request: FunctionRequest<T>) => any,
        validator?: ValidatorOrHandler<FunctionRequest<T>>,
      ): void;

      /** Registers a background job. */
      function job(
        name: string,
        handler: (request: JobRequest) => any,
      ): void;

      /**
       * Runs before an object is saved. Pass `Parse.File` to register a
       * file-save trigger.
       */
      function beforeSave(
        fileClass: typeof File,
        handler: (request: FileTriggerRequest) => TriggerResult<void | File>,
        validator?: ValidatorOrHandler<FileTriggerRequest>,
      ): void;
      function beforeSave<T extends Object = Object>(
        parseClass: TriggerClass<T>,
        handler: (request: BeforeSaveRequest<T>) => TriggerResult<void | T>,
        validator?: ValidatorOrHandler<BeforeSaveRequest<T>>,
      ): void;

      /** Runs after an object is saved. Pass `Parse.File` for file triggers. */
      function afterSave(
        fileClass: typeof File,
        handler: (request: FileTriggerRequest) => TriggerResult,
        validator?: ValidatorOrHandler<FileTriggerRequest>,
      ): void;
      function afterSave<T extends Object = Object>(
        parseClass: TriggerClass<T>,
        handler: (request: AfterSaveRequest<T>) => TriggerResult,
        validator?: ValidatorOrHandler<AfterSaveRequest<T>>,
      ): void;

      /** Runs before an object is deleted. Pass `Parse.File` for file triggers. */
      function beforeDelete(
        fileClass: typeof File,
        handler: (request: FileTriggerRequest) => TriggerResult,
        validator?: ValidatorOrHandler<FileTriggerRequest>,
      ): void;
      function beforeDelete<T extends Object = Object>(
        parseClass: TriggerClass<T>,
        handler: (request: BeforeDeleteRequest<T>) => TriggerResult,
        validator?: ValidatorOrHandler<BeforeDeleteRequest<T>>,
      ): void;

      /** Runs after an object is deleted. Pass `Parse.File` for file triggers. */
      function afterDelete(
        fileClass: typeof File,
        handler: (request: FileTriggerRequest) => TriggerResult,
        validator?: ValidatorOrHandler<FileTriggerRequest>,
      ): void;
      function afterDelete<T extends Object = Object>(
        parseClass: TriggerClass<T>,
        handler: (request: AfterDeleteRequest<T>) => TriggerResult,
        validator?: ValidatorOrHandler<AfterDeleteRequest<T>>,
      ): void;

      /**
       * Runs before a query is executed. The handler may mutate `request.query`
       * or return a replacement `Parse.Query`.
       */
      function beforeFind<T extends Object = Object>(
        parseClass: TriggerClass<T>,
        handler: (
          request: BeforeFindRequest<T>,
        ) => TriggerResult<void | Query<T>>,
        validator?: ValidatorOrHandler<BeforeFindRequest<T>>,
      ): void;

      /**
       * Runs after a query is executed. The handler may return a replacement
       * array of results.
       */
      function afterFind<T extends Object = Object>(
        parseClass: TriggerClass<T>,
        handler: (request: AfterFindRequest<T>) => TriggerResult<void | T[]>,
        validator?: ValidatorOrHandler<AfterFindRequest<T>>,
      ): void;

      /** Runs before a user logs in. */
      function beforeLogin(
        handler: (request: TriggerRequest<User>) => TriggerResult,
        validator?: ValidatorOrHandler<TriggerRequest<User>>,
      ): void;

      /** Runs after a user logs in. */
      function afterLogin(
        handler: (request: TriggerRequest<User>) => TriggerResult,
      ): void;

      /** Runs after a user logs out. */
      function afterLogout(
        handler: (request: TriggerRequest) => TriggerResult,
      ): void;

      /** Runs before a password-reset email is sent. */
      function beforePasswordResetRequest(
        handler: (request: TriggerRequest<User>) => TriggerResult,
        validator?: ValidatorOrHandler<TriggerRequest<User>>,
      ): void;

      // Dedicated file-trigger registrations (legacy API; the Parse.File
      // overloads of beforeSave/afterSave/etc. above are the modern unified API).
      function beforeSaveFile(
        handler: (request: FileTriggerRequest) => TriggerResult<void | File>,
      ): void;
      function afterSaveFile(
        handler: (request: FileTriggerRequest) => TriggerResult,
      ): void;
      function beforeDeleteFile(
        handler: (request: FileTriggerRequest) => TriggerResult,
      ): void;
      function afterDeleteFile(
        handler: (request: FileTriggerRequest) => TriggerResult,
      ): void;

      /** Runs before a LiveQuery client connects. */
      function beforeConnect(
        handler: (request: ConnectTriggerRequest) => TriggerResult,
        validator?: ValidatorOrHandler<ConnectTriggerRequest>,
      ): void;

      /** Runs before a LiveQuery subscription is created. */
      function beforeSubscribe<T extends Object = Object>(
        parseClass: TriggerClass<T>,
        handler: (request: TriggerRequest<T>) => TriggerResult,
        validator?: ValidatorOrHandler<TriggerRequest<T>>,
      ): void;

      /** Runs after a LiveQuery event, before it is sent to clients. */
      function afterLiveQueryEvent<T extends Object = Object>(
        parseClass: TriggerClass<T>,
        handler: (request: LiveQueryEventTrigger<T>) => TriggerResult,
        validator?: ValidatorOrHandler<LiveQueryEventTrigger<T>>,
      ): void;

      /** Registers a listener for LiveQuery server lifecycle events. */
      function onLiveQueryEvent(
        handler: (info: LiveQueryEventHandlerInfo) => void,
      ): void;

      /** Sends an email through the configured email adapter. */
      function sendEmail(data: {
        from?: string;
        to: string;
        subject?: string;
        text?: string;
        html?: string;
      }): Promise<void>;

      /** Issues an HTTP request from Cloud Code. */
      function httpRequest(options: HTTPOptions): Promise<HTTPResponse>;

      /** Cloud Code only. Marks subsequent calls in this request as master-key. */
      function useMasterKey(): void;
    }
  }
}
