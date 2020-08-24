// TypeScript configuration sourced from https://github.com/typescript-eslint/typescript-eslint/blob/master/docs/getting-started/linting/README.md#configuration
// configuration: https://eslint.org/docs/user-guide/configuring
module.exports = {
    root: true,
    ignorePatterns: [
        ".eslintrc.js",
    ],
    env: {
        browser: true,
    },
    parser: "@typescript-eslint/parser",
    parserOptions: {
        sourceType: "module",
    },
    plugins: [
        "@typescript-eslint",
    ],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:import/typescript",
    ],
    rules: {
        // eslint-plugin-import
        "import/no-unresolved": ["error"],
        "import/named": ["error"],
        "import/default": ["error"],
        "import/namespace": ["error"],
        "import/no-restricted-paths": ["error", {zones: [{target: "./src", from: "./"}]}],
        "import/no-absolute-path": ["error"],
        "import/no-dynamic-require": ["error"],
        "import/no-self-import": ["error"],
        "import/no-cycle": ["error"],
        "import/no-useless-path-segments": ["error"],
        "import/no-relative-parent-imports": ["error"],
        "import/no-mutable-exports": ["error"],
        "import/no-unused-modules": ["warn"],
        "import/first": ["error"],
        "import/no-duplicates": ["error"],
        "import/order": ["error", {"groups": ["index", "sibling", "parent", "internal", "external", "builtin", "object"]}],
        "import/newline-after-import": ["error"],
        "import/no-namespace": ["error"],
    },
};
