const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const NodemonPlugin = require("nodemon-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

module.exports = merge(common, {
  mode: "development",

  plugins: [
    new ForkTsCheckerWebpackPlugin(),
    new NodemonPlugin({
      script: "./dist/index.js",
    }),
  ],
});
