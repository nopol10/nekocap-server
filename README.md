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

The server runs on [Parse](https://github.com/parse-community/parse-server). The
NekoCap extension and website calls cloud functions implemented here.

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
   your MongoDB database
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
