// TypeScript configuration sourced from https://github.com/typescript-eslint/typescript-eslint/blob/master/docs/getting-started/linting/README.md#configuration
// configuration: https://eslint.org/docs/user-guide/configuring
module.exports = {
    root: true,
    ignorePatterns: [
        ".eslintrc.js",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        sourceType: "script",
    },
    plugins: [
        "@typescript-eslint",
    ],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    env: {
        browser: true,
    },
};
