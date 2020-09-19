const path = require("path");
const dotenv = require("dotenv");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const LicenseWebpackPlugin = require("license-webpack-plugin")
  .LicenseWebpackPlugin;

const env = dotenv.config().parsed;
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

module.exports = {
  target: "node",
  entry: {
    cloud: path.join(__dirname, "src/cloud/main.ts"),
  },
  output: {
    path: path.join(__dirname, "dist"),
    filename: "[name].js",
  },
  module: {
    rules: [
      {
        exclude: /node_modules/,
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
      },
    ],
  },
  plugins: [
    new LicenseWebpackPlugin(),
    new webpack.DefinePlugin(envKeys),
    new webpack.IgnorePlugin({ resourceRegExp: /^pg-native$/ }),
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
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
  node: {
    child_process: "empty",
    fs: "empty",
    crypto: "empty",
    net: "empty",
    tls: "empty",
    __dirname: false,
    __filename: false,
  },
};
