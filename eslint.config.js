import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "**/build/",
      "android/app/src/main/assets/public/",
      "ios/App/App/public/",
      "Elix Star Live/",
      "_aab_peek/",
      "_audit/",
      "assets/",
      "*.config.js",
      "*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "no-irregular-whitespace": "off",
      "no-empty": "warn",
      "prefer-const": "warn",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        URL: "readonly",
        __ENV: "readonly",
      },
    },
  },
  {
    files: ["loadtest/**/*.js"],
    languageOptions: {
      globals: {
        __ENV: "readonly",
        __VU: "readonly",
      },
    },
  },
  {
    files: ["server/middleware/auth.ts", "server/middleware/rbac.ts", "server/middleware/requestId.ts"],
    rules: {
      "@typescript-eslint/no-namespace": "off",
    },
  },
];
