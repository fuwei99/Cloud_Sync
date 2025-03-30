const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

// Config for the backend plugin code
const serverConfig = {
    devtool: 'source-map', // Use source-map for better debugging
    target: 'node',
    entry: './src/index.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'plugin.js',
        library: {
            type: 'commonjs2',
        },
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
            }),
        ],
    },
    plugins: [],
    // Watch options can be useful during development
    // watch: true, 
    // watchOptions: {
    //   ignored: /node_modules/,
    // },
};

// Config for the frontend UI code
const clientConfig = {
    mode: process.env.NODE_ENV || 'production', // Use NODE_ENV or default to production
    entry: './public/main.ts', // Entry point for frontend code
    output: {
        path: path.resolve(__dirname, 'public'), // Output to the public directory
        filename: 'main.js', // Output filename
        publicPath: '', // Empty string for relative paths
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    devtool: 'source-map', // Enable source maps for client-side debugging
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
            }),
        ],
    },
    plugins: [],
};

// Export both configurations
module.exports = [serverConfig, clientConfig]; 