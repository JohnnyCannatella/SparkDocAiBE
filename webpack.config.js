import path from "path";

export default {
    mode: "production", // or "development", depending on your environment
    entry: "./app.js", // Replace this with the correct entry point for your app
    output: {
        path: path.resolve(path.dirname("."), "dist"),
        filename: "bundle.js",
    },
    target: "node", // Ensures Webpack bundles your code for Node.js
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader", // Ensures compatibility with older Node.js versions (optional)
                },
            },
        ],
    },
    resolve: {
        extensions: [".js"],
    },
};