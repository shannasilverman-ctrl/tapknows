import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Keep the established Hooks correctness contract while using a plugin
      // release that supports the current lint toolchain. Compiler migration
      // rules are intentionally adopted separately from dependency updates.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Storage, permission, and best-effort telemetry paths intentionally
      // degrade without surfacing an error to the customer.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // The generated Supabase row surface still contains a few dynamic
      // extension points. Keep them visible while migration types are narrowed.
      "@typescript-eslint/no-explicit-any": "warn",
      "no-useless-assignment": "warn",
    },
  },
  eslintPluginPrettier,
);
