const path = require('path')
const CleanWebpackPlugin = require('clean-webpack-plugin');
const fs = require('fs');
const keysTransformer = require('./common/node_modules/ts-transformer-keys/transformer').default;
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const nodeModules = {};
fs.readdirSync(path.resolve(__dirname, 'node_modules'))
    .filter(function (x) {
        return ['.bin'].indexOf(x) === -1;
    })
    .forEach(function (mod) {
        nodeModules[mod] = 'commonjs ' + mod;
    });
fs.readdirSync(path.resolve(__dirname, 'common/node_modules'))
    .filter(function (x) {
        return ['.bin'].indexOf(x) === -1;
    })
    .forEach(function (mod) {
        nodeModules[mod] = 'commonjs ' + mod;
    });

module.exports = (env, options) => {
    const mode = options.mode;
    const isProduction = mode === 'production';
    const outDir = 'build';

    return {
        stats: 'minimal',
        performance: {
            hints: false
        },
        entry: {
            "app": path.resolve(__dirname, "src/index.ts"),
        },
        target: 'node',
        node: {
            __dirname: false
        },
        externals: nodeModules,
        output: {
            filename: "index.js",
            path: `${__dirname}/${outDir}`
        },
        devtool: isProduction ? undefined : 'source-map',
        resolve: {
            extensions: [".ts", ".tsx", ".js", ".json"],
            alias: {
                "@common": path.resolve(__dirname, "common")
            }
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: "@neoncom/ts-loader",
                    exclude: [/node_modules/],
                    options: {
                        getCustomTransformers: () => {
                            return {
                                before: [p => keysTransformer(p)]
                            };
                        }
                    }
                },
            ]
        },
        plugins: [
            new CleanWebpackPlugin(outDir),
            new webpack.BannerPlugin({
                banner:"require('source-map-support').install();",
                raw: true
            }),
            new CopyWebpackPlugin([
                {
                    context:'./esptool',
                    from:'*.py',
                    to:path.join(__dirname,outDir,'esptool')
                },{
                    context:'./esptool',
                    from:'ecdsa', 
                    to:path.join(__dirname,outDir,'esptool','ecdsa')
                },{
                    context:'./esptool',
                    from:'pyaes',
                    to:path.join(__dirname,outDir,'esptool','pyaes')
                }
            ]),
            new webpack.BannerPlugin({
                banner: '#!/usr/bin/env node',
                raw: true
            })
        ]
    }
};