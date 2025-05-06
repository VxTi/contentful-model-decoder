import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const compat = new FlatCompat({
  baseDirectory: import.meta.url,
});

export default [
  // Include recommended TypeScript rules
  ...compat.extends("plugin:@typescript-eslint/recommended"),
  ...eslintConfigPrettier,
  ...compat.extends(
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ),

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json", // Required for type-aware rules
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: false,
        },
      ],
    },
  },
];
