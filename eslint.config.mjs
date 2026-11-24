import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const nextApps = ["apps/website/**", "apps/dashboard/**", "packages/ui/**"];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/generated/**",
      "**/next-env.d.ts",
      "services/**",
      "**/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  ...nextVitals.map((config) => ({ ...config, files: nextApps })),
  {
    files: nextApps,
    settings: { next: { rootDir: ["apps/website/", "apps/dashboard/"] } },
  },
  {
    // Tests read rows they just inserted; a failed assertion there is a test failure, not a runtime risk.
    files: ["**/test/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  }
);
