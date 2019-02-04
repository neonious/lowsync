const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const fs = require('fs');
const keysTransformer = require('ts-transformer-keys/transformer').default;
const webpack = require('webpack');

const nodeModules = {};
fs.readdirSync(path.resolve(__dirname, 'node_modules'))
  .filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });
fs.readdirSync(path.resolve(__dirname, 'common/node_modules'))
  .filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });

module.exports = (env, options) => {
  const mode = options.mode;
  const outDir = 'buildtest';

  return {
    stats: 'minimal',
    performance: {
      hints: false
    },
    entry: {
      app: path.resolve(__dirname, 'test.ts')
    },
    target: 'node',
    node: {
      __dirname: false
    },
    externals: nodeModules,
    output: {
      filename: 'test.js',
      path: `${__dirname}/${outDir}`
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      alias: {
        '@common': path.resolve(__dirname, 'common', 'src')
      }
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: '@neoncom/ts-loader',
          exclude: [/node_modules/],
          options: {
            getCustomTransformers: () => {
              return {
                before: [p => keysTransformer(p)]
              };
            }
          }
        }
      ]
    },
    plugins: [
      new CleanWebpackPlugin(outDir),
      new webpack.BannerPlugin({
        banner: "require('source-map-support').install();",
        raw: true
      }),
      new webpack.EnvironmentPlugin({
        TARGETWEB: 'false'
      })
    ]
  };
};
