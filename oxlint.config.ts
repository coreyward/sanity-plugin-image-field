import { defineConfig } from "oxlint"

export default defineConfig({
  plugins: ["react", "unicorn", "typescript", "oxc", "jsx-a11y", "vitest"],
  env: {
    builtin: true,
    es2026: true,
  },
  options: {
    typeAware: true,
    reportUnusedDisableDirectives: "warn",
  },
  categories: {
    correctness: "deny",
    suspicious: "warn",
    perf: "warn",
  },
  rules: {
    curly: "error",
    "no-irregular-whitespace": ["error", { skipComments: true }],
    "sort-imports": [
      "warn",
      {
        ignoreCase: true,
        ignoreDeclarationSort: true,
      },
    ],
    "react/react-in-jsx-scope": "allow",
    "react/only-export-components": ["error", { allowConstantExport: true }],
    "typescript/consistent-type-definitions": ["error", "type"],
    "typescript/restrict-template-expressions": [
      "error",
      { allowNumber: true },
    ],
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unnecessary-condition": "error",
    "typescript/no-deprecated": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/prefer-nullish-coalescing": "off",
    "no-underscore-dangle": [
      "warn",
      { allow: ["_ref", "_id", "_type", "_key"] },
    ],
  },
})
