import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  tsconfig: "tsconfig.lib.json",
  dts: {
    // tsup always injects `baseUrl: "."` for the dts pass, which TypeScript 6.0
    // treats as a hard error unless deprecations are explicitly tolerated.
    compilerOptions: {
      ignoreDeprecations: "6.0",
    },
  },
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "sanity",
    "@sanity/ui",
    "@sanity/icons",
    "@sanity/types",
    "@sanity-image/url-builder",
    "styled-components",
  ],
})
