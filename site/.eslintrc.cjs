module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  rules: {
    complexity: ["error", { max: 10 }],
    "max-depth": ["error", 3],
    "max-lines-per-function": ["error", { max: 200, skipComments: true }],
    "no-constant-condition": ["error", { checkLoops: true }],
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-explicit-any": ["error", { ignoreRestArgs: false }],
    "@typescript-eslint/explicit-module-boundary-types": "error",
  },
  overrides: [
    {
      files: ["*.astro"],
      parser: "astro-eslint-parser",
      parserOptions: {
        parser: "@typescript-eslint/parser",
        extraFileExtensions: [".astro"],
      },
    },
  ],
};
