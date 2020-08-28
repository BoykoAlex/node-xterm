var webpack = require('webpack');
var path = require('path');
const MinifyPlugin = require("babel-minify-webpack-plugin");

module.exports = {
    entry: [
        './terminal-client.ts'
    ],
    output: {
        filename: 'terminal-client-bundled.js',
        path: path.resolve(__dirname, '.')
    },
    mode: 'development',
    devtool: 'source-map',
    resolve: {
        // Add `.ts` and `.tsx` as a resolvable extension.
        extensions: ['.webpack.js', '.web.js', '.ts', '.tsx', '.js']
    },
    module: {
        rules: [
            // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
            {
                test: /\.tsx?$/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        configFile: path.resolve(__dirname, 'tsconfig.json')
                    }
                }]
            }
        ]
    },
    node : { fs: 'empty', net: 'empty' },
    plugins: [
        new MinifyPlugin({}, {}),
        new webpack.WatchIgnorePlugin([
            /\.js$/,
            /\.d\.ts$/
        ])
    ]
};
