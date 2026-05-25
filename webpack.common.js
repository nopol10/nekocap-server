const path = require("path");
const dotenv = require("dotenv");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const nodeExternals = require("webpack-node-externals");
const LicenseWebpackPlugin = require("license-webpack-plugin")
  .LicenseWebpackPlugin;

const env = dotenv.config().parsed;
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

const nestDir = path.join(__dirname, "src/nest");

/** @type { import('webpack').Configuration } */
module.exports = {
  target: "node",
  entry: {
    cloud: path.join(__dirname, "src/cloud/main.ts"),
    nest: {
      import: path.join(__dirname, "src/nest/main.ts"),
      library: { type: "commonjs2" },
    },
  },
  output: {
    path: path.join(__dirname, "dist"),
    filename: "[name].js",
    hashFunction: "sha512",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: nestDir,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "src/nest/tsconfig.json"),
            transpileOnly: false,
          },
        },
      },
      {
        exclude: [/node_modules/, nestDir],
        test: /\.tsx?$/,
        use: "babel-loader",
      },
      {
        exclude: /node_modules/,
        test: /\.js?$/,
        use: "babel-loader",
      },
      {
        test: /\.node?$/,
        use: "file-loader",
        type: "javascript/auto",
      },
    ],
  },
  plugins: [
    new LicenseWebpackPlugin(),
    new webpack.DefinePlugin(envKeys),
    new webpack.IgnorePlugin({ resourceRegExp: /^pg-native$/ }),
    // NestJS + mongodb optional peer deps we don't use
    new webpack.IgnorePlugin({
      checkResource(resource) {
        const lazyOptional = [
          "@nestjs/microservices",
          "@nestjs/microservices/microservices-module",
          "@nestjs/websockets",
          "@nestjs/websockets/socket-module",
          "cache-manager",
          "class-transformer",
          "class-transformer/storage",
          "class-validator",
          "@mongodb-js/zstd",
          "@aws-sdk/credential-providers",
          "gcp-metadata",
          "snappy",
          "socks",
          "mongodb-client-encryption",
          "kerberos",
        ];
        return lazyOptional.includes(resource);
      },
    }),
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "index.js"),
          to: path.resolve(__dirname, "dist", "index.js"),
        },
        {
          from: path.resolve(__dirname, ".env"),
          to: path.resolve(__dirname, "dist", ".env"),
          toType: "file",
        },
        {
          from: path.resolve(__dirname, "firebase-service-account-key.json"),
          to: path.resolve(
            __dirname,
            "dist",
            "firebase-service-account-key.json"
          ),
        },
      ],
    }),
  ],
  resolve: {
    plugins: [new TsconfigPathsPlugin()],
    extensions: [".ts", ".tsx", ".js", ".json"],
  },
  externalsPresets: { node: true },
  externals: [
    nodeExternals({
      // Bundle aliased imports from the sibling nekocap workspace; everything
      // else in node_modules is required at runtime so packages like
      // `mongodb` / `whatwg-url` aren't mangled by Terser.
      allowlist: [/^@\//],
    }),
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          // NestJS DI tokens and @nestjs/mongoose model names come from
          // `Class.name`, so collapsing distinct classes to the same local
          // identifier would cause models to clobber each other.
          keep_classnames: true,
          keep_fnames: true,
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
  node: {
    // child_process: "empty",
    // fs: "empty",
    // crypto: "empty",
    // net: "empty",
    // tls: "empty",
    __dirname: false,
    __filename: false,
  },
};
