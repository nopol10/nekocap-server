# Cloud function integration tests

These tests boot a real Parse Server (loading `src/cloud/main.ts` via `tsx`)
against an in-memory MongoDB instance, then exercise cloud functions through
`Parse.Cloud.run(...)`. They assert the public request/response contract of each
endpoint so the tests stay valid if the underlying framework is later swapped
out.

## Running

```sh
npm test
```

## Requirements

- The first run downloads a `mongod` binary via `mongodb-memory-server`, which
  needs outbound access to `fastdl.mongodb.org`. If your environment blocks
  that host, point the test harness at a locally-installed `mongod` binary:

  ```sh
  MONGOMS_SYSTEM_BINARY=/path/to/mongod npm test
  ```

  When neither is available, the suite skips its tests with a clear reason
  rather than failing.

## Layout

- `helpers/parse-test-server.ts` — boots Parse Server + Mongo for each test
  file; exposes `startParseServer` / `stopParseServer`.
- `helpers/invoke-cloud-function.ts` — the **framework-swap seam**: the only
  place tests speak Parse-flavoured SDK. When swapping Parse for something
  else, re-implement this single helper.
- `helpers/fixtures.ts` — small seeding helpers (`createTestUser`,
  `makeUserAdmin`, `createCaptioner`, `resetCollections`).
- `cloud/*.test.ts` — one file per cloud function, describing its
  request/response contract.
