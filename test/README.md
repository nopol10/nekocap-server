# Cloud function integration tests

These tests boot a real Parse Server (loading `src/cloud/main.ts` via `tsx`)
together with the NestJS app, mounted on the same express app as in production,
against an in-memory MongoDB instance. Contract tests run through both
transports: the legacy Parse cloud functions (`Parse.Cloud.run(...)`), which
delegate to NestJS, and the NestJS REST API. They assert the public
request/response contract of each endpoint so that both keep behaving the same.

## Running

```sh
npm test
```

## Requirements

- The first run downloads a `mongod` binary via `mongodb-memory-server`, which
  needs outbound access to `fastdl.mongodb.org`. If your environment blocks that
  host, point the test harness at a locally-installed `mongod` binary:

  ```sh
  MONGOMS_SYSTEM_BINARY=/path/to/mongod npm test
  ```

  When neither is available, the suite skips its tests with a clear reason
  rather than failing.

## Layout

- `helpers/parse-test-server.ts` — boots Parse Server + Mongo for each test
  file; exposes `startParseServer` / `stopParseServer`.
- `helpers/invoke-api.ts` — calls an API either as a Parse cloud function or
  through its REST endpoint (`TRANSPORTS`), mirroring how the frontend's
  NestJsProvider maps them.
- `helpers/invoke-rest.ts` / `helpers/invoke-cloud-function.ts` — the raw REST
  and Parse calls.
- `helpers/use-test-server.ts` — starts the server for a describe block and
  resets data between tests.
- `helpers/test-identity-provider.ts` — stands in for Firebase logins.
- `helpers/fixtures.ts` — small seeding helpers (`createTestUser`,
  `makeUserAdmin`, `createCaptioner`, `resetCollections`).
- `cloud/*.test.ts` — one file per cloud function, describing its
  request/response contract (run through both transports).
- `nest/*.test.ts` — auth, the caption lifecycle, the legacy bridge and Parse
  on-disk format compatibility.
