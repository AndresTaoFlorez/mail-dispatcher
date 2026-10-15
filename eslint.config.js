import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
export default ts.config(
  { ignores: ["**/dist/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: [
      "backend/mail-api/src/domain/**/*.ts",
      "backend/mail-api/src/application/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "**/infrastructure/**",
            "**/presentation/**",
            "fastify",
            "pg",
            "@azure/*",
            "node:*",
          ],
        },
      ],
    },
  },
  {
    files: ["backend/mail-api/src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "**/application/**",
            "**/infrastructure/**",
            "**/presentation/**",
            "fastify",
            "pg",
            "@azure/*",
            "node:*",
          ],
        },
      ],
    },
  },
);
