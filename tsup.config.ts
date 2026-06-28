import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "extractor/index": "src/extractor/index.ts",
    "compiler/core": "src/compiler/core.ts",
    "compiler/index": "src/compiler/index.ts",
    "cloudflare/index": "src/cloudflare/index.ts",
    "worker/index": "src/worker/index.ts",
  },
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: true,
  treeshake: true,
  external: ["tailwindcss"],
  noExternal: ["postcss"],
});
