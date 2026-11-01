<p align="center">
    <a href="https://nekocap.com/" target="_blank" rel="noopener">
        <img src="https://user-images.githubusercontent.com/314281/102780389-cc03ed00-43d0-11eb-87c3-6d50a2ab5752.png" width="100" alt="NekoCap logo">
    </a>
</p>

<h1 align="center">NekoCap Server</h1>
<div align="center">
The server used by NekoCap for caption submission and retrieval.
<br/>
Get the extension:
<a href="https://chrome.google.com/webstore/detail/nekocap/gmopgnhbhiniibbiilmbjilcmgaocokj" target="_blank" rel="noopener">
        Chrome / Edge
</a> | 
<a href="https://addons.mozilla.org/en-US/firefox/addon/nekocap/" target="_blank" rel="noopener">
        Firefox
</a>
<br/>
Website:
<a href="https://nekocap.com/" target="_blank" rel="noopener">
        NekoCap.com
</a>
</div>
<br/>
<div align="center"><font size="3">Join the Discord here:</font></div>
<div align="center">

[![Discord Chat](https://img.shields.io/discord/760819014514638888.svg)](https://discord.gg/xZ9YEXY5pd)

</div>

## Server

The server is a [NestJS](https://nestjs.com/) app that runs in the same process
as [Parse Server](https://github.com/parse-community/parse-server):

- **NestJS** (`src/nest`) holds all of the business logic and serves the REST
  API at `/api/v1`, which current versions of the extension and website use.
- **Parse Server** stays mounted at `/parse` so that older versions of the
  extension keep working. Its cloud functions (`src/cloud`) are thin wrappers
  that call the same NestJS services in-process, so both APIs always behave the
  same. Parse also still serves raw caption files (`/parse/files`) and handles
  logins from older clients.

Both share the same MongoDB collections. NestJS reads and writes them in Parse's
on-disk format (`src/nest/parse-compat`), so no data migration is needed and
sessions work across both APIs: a session created by logging in through either
API is accepted by the other.

### Authentication

Users log in with an identity provider (Firebase today) through
`POST /api/v1/auth/login`, which returns a NekoCap session token. Subsequent
requests send it as `Authorization: Bearer <token>` (or the Parse
`X-Parse-Session-Token` header). Identity providers are pluggable: to add a
login method, implement `IdentityProvider`
(`src/nest/auth/providers/identity-provider.ts`) and register it in
`AuthModule`. Users are linked to providers through `_User.authData`, the same
way Parse links them.

### REST API

All endpoints are under `/api/v1`. Responses keep the shape of the Parse cloud
function they replace (`{status: "success" | "error", error?, ...}`).

| Endpoint                                                                      | Replaces cloud function                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `POST /auth/login`, `POST /auth/logout`, `POST /auth/link`, `GET /auth/me`    | `Parse.User.logInWith`                                            |
| `GET /captions?videoId&videoSource`                                           | `findCaptions`                                                    |
| `GET /captions/latest`, `GET /captions/latest/:languageCode`                  | `loadLatestCaptions`, `loadLatestLanguageCaptions`                |
| `GET /captions/popular`, `GET /captions/browse?limit&offset`                  | `loadPopularCaptions`, `browse`                                   |
| `POST /captions`, `PATCH /captions/:id`, `DELETE /captions/:id`               | `submitCaption`, `updateCaption`, `deleteCaption`                 |
| `GET /captions/:id`, `GET /captions/:id/review`                               | `loadCaption`, `loadCaptionForReview`                             |
| `POST /captions/:id/{like,dislike,reject,verify}`                             | `likeCaption`, `dislikeCaption`, `rejectCaption`, `verifyCaption` |
| `GET /captioners/me`, `PATCH /captioners/me`                                  | `loadPrivateCaptionerData`, `updateCaptionerProfile`              |
| `GET /captioners/me/tags`, `DELETE /captioners/me/tags/:tagName`              | `getOwnProfileTags`, `deleteProfileTag`                           |
| `GET /captioners/:userId`, `GET /captioners/:userId/captions`                 | `loadProfile`, `loadUserCaptions`                                 |
| `POST /captioners/:userId/{verify,ban}`                                       | `verifyCaptioner`, `banCaptioner`                                 |
| `POST /captioners/:userId/roles/{reviewer,reviewer-manager}`                  | `assignReviewerRole`, `assignReviewerManagerRole`                 |
| `GET /search`                                                                 | `search`                                                          |
| `GET /stats/global`, `GET /homepage-stats`                                    | `globalStats`                                                     |
| `GET /videos/auto-captions?videoId&videoSource`                               | `getAutoCaptionList`                                              |
| `POST /admin/migration/{video,youtube-videos,captioner,caption}` (master key) | migration functions                                               |

### Removing Parse later

Once no supported client uses the Parse API anymore, remove the Parse mount in
`index.js`, the `src/cloud` directory and the `cloud` webpack entry, and serve
raw caption files from NestJS (`FilesService` already reads them).

This project shares Typescript types with the
[extension project](https://github.com/nopol10/nekocap) so ensure that this
project folder sits beside that or modify the path in `tsconfig.json`:

```
"paths": {
    ...
    "@/*": ["../nekocap/src/*"] // <-- Change to your nekocap project's path
    ...
}
```

## Setup for local development

1. Run `npm install`
1. Install mongodb and create a new database.
1. Copy the contents of `.env.sample` to `.env` and fill in the details.
   - `DATABASE_URI` should be the mongodb URI for your database
   - `FIREBASE_SERVICE_ACCOUNT` is used for Firebase authentication, grab it
     from your Firebase project
1. Import `database/nekocap-schema.json` into a collection called `_SCHEMA` in
   your MongoDB database (NestJS also adds any missing classes and fields on
   startup)
1. Run `npm run watch` to start the server

### If you want to build the NekoCap server Docker image

1. Copy the contents of `Dockerfile.sample` to `Dockerfile`, replace the
   placeholder strings
1. Change the path to the NekoCap extension project so that type definitions can
   be copied for the build.
1. Run `npm run docker:build` or build the docker image from a **parent**
   directory of this project as the Dockerfile references directories outside of
   this project.
   ```sh
   cd ..
   docker build --file="./nekocap-server/Dockerfile" --tag="nekocap-server" .
   ```

## Environment variables

| Variable                 | Type   | Description                                                                                                                                                                                                                                                                                                                                              | Example                                            |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| DATABASE_URI             | string | URI to the mongodb database.                                                                                                                                                                                                                                                                                                                             | mongodb://username:password@localhost/databaseName |
| APP_ID                   | string | App ID of your Parse Application. You are free to set any name you want for your own instance.                                                                                                                                                                                                                                                           |
| MASTER_KEY               | string | Master key for the Parse server. Don't lose this and do NOT commit to the repository                                                                                                                                                                                                                                                                     |
| SERVER_URL               | string | The URL that Parse Cloud Code will use to connect to this Parse server. In development, if INTERNAL_PORT is part of this URL, it will be replaced by PORT. (Using the examples in this table, SERVER_URL will become http://localhost:4041/parse in development. This should also be the PARSE_INTERNAL_SERVER_URL environment variable in the frontend) | http://localhost:4042/parse                        |
| PUBLIC_SERVER_URL        | string | Publically accessible server URL. This should correspond to NEXT_PUBLIC_PARSE_SERVER_URL on the frontend in production.                                                                                                                                                                                                                                  | https://api.mynekocapinstance.com/parse            |
| PORT                     | number | The port that the Parse server will listen to. In development, this is the port that the HTTP (not HTTPS) server will listen on. In production (when the PROD environment variable is defined), this is the port that the HTTPS server will listen on.                                                                                                   | 4041                                               |
| INTERNAL_PORT            | number | The port that the HTTP server will listen on. In development, PORT overrides this and this has no effect.                                                                                                                                                                                                                                                | 4042                                               |
| FIREBASE_SERVICE_ACCOUNT | string | The path to the json file containing your firebase service account details (or the JSON itself). Used by both Parse and NestJS to verify Firebase logins                                                                                                                                                                                                 | "firebase-service-account-key.json"                |
| CLOUD_CODE_MAIN          | string | Path to the main cloud code JS file                                                                                                                                                                                                                                                                                                                      | dist/cloud.js                                      |
| SSL_CERT_PATH            | string | Path to your SSL cert. Only needed in production.                                                                                                                                                                                                                                                                                                        | /path/to/your/cert/cert.pem                        |
| SSL_KEY_PATH             | string | Path to your private key. Only needed in production.                                                                                                                                                                                                                                                                                                     | /path/to/your/cert/key.pem                         |
| PROD                     | any    | Define this to denote that the server should be running in production mode                                                                                                                                                                                                                                                                               |                                                    |
| BACKEND_SENTRY_DSN       | string | URL to send your Sentry events                                                                                                                                                                                                                                                                                                                           |                                                    |

## Tests

```sh
npm test
```

The tests run against an in-memory MongoDB with both Parse Server and the NestJS
app started, and most contract tests run once through the Parse cloud functions
and once through the REST API. See [test/README.md](test/README.md).
