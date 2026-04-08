import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  // Keep generated/build output out of lint.
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      // Next.js core rules
      ...nextPlugin.configs["core-web-vitals"].rules,

      // React hooks correctness
      ...reactHooks.configs.recommended.rules,

      // Work around a crashing edge-case in this rule on some TS AST nodes.
      // TypeScript itself + `next build` already provides strong safety signals.
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",

      // Practical TS ergonomics for this project (SDK responses are dynamic).
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",

      // Too noisy for now; hooks rules still protect correctness.
      "react-hooks/preserve-manual-memoization": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },
];

