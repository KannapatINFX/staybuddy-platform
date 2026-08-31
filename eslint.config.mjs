import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.expo/**",
      "**/.next/**",
      "**/artifacts/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/web-build/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["services/api/src/**/*.ts"],
    rules: {
      // Nest constructor parameter types are runtime dependency-injection tokens.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
);
