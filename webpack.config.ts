import {ConfigurationFactory} from "webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import {resolve} from "path";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const config: ConfigurationFactory = (...[env, arg]: Parameters<ConfigurationFactory>): ReturnType<ConfigurationFactory> => {
    return {
        mode: env === "production" ? "production" : "development",
        entry: "./src/js/index.ts",
        resolve: {
            extensions: [".js", ".ts"],
        },
        output: {
            path: resolve(process.cwd(), "dist"),
            filename: "district-visualizer.js",
        },
        module: {
            rules: [{
                test: [/\.ts$/],
                use: "ts-loader",
                exclude: [/node_modules/, resolve(process.cwd(), "gulp")],
            }],
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: "./src/index.html",
                inject: "head",
                scriptLoading: "defer",
            }),
        ],
    };
};

export default config;
