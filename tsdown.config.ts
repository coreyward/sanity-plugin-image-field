import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  tsconfig: "tsconfig.lib.json",
  dts: true,
  fixedExtension: false,
  sourcemap: true,
  clean: true,
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
