import { describe, expect, test } from "vitest";
import { compile, scan } from "../src/compiler/index.js";
import { memoryCache } from "../src/cloudflare/index.js";
import { inlineTailwindCss, nodeTailwindStylesheetLoader } from "./fixtures/tailwind.js";

describe("compiler", () => {
  test("merges scanned sources and explicit candidates", async () => {
    await expect(
      scan({
        sources: [
          { kind: "text", content: '<div class="text-red-500"></div>' },
          { kind: "candidates", candidates: ["hover:bg-blue-100"] },
        ],
        candidates: ["text-red-500"],
      }),
    ).resolves.toEqual({
      candidates: ["class", "hover:bg-blue-100", "text-red-500"],
    });
  });

  test("compiles explicit candidates with stable hashes and cache keys", async () => {
    const cache = memoryCache();
    const input = {
      css: inlineTailwindCss,
      candidates: ["text-red-500", "hover:bg-blue-100"],
      cache,
    };

    const first = await compile(input);
    const second = await compile({
      ...input,
      candidates: ["hover:bg-blue-100", "text-red-500"],
    });

    expect(first.css).toContain(".text-red-500");
    expect(first.css).toContain(".hover\\:bg-blue-100");
    expect(second.hash).toBe(first.hash);
    expect(second.cacheKey).toBe(first.cacheKey);
  });

  test("adapts loadStylesheet imports for Tailwind", async () => {
    const result = await compile({
      css: '@import "tailwindcss/theme.css" layer(theme); @import "tailwindcss/utilities.css" layer(utilities);',
      candidates: ["text-red-500"],
      loadStylesheet: nodeTailwindStylesheetLoader,
      emit: "full",
    });

    expect(result.css).toContain("@layer theme");
    expect(result.css).toContain("@layer utilities");
    expect(result.css).toContain(".text-red-500");
  });

  test("throws a Vaportrail-owned import error when no loader is provided", async () => {
    await expect(
      compile({
        css: '@import "./theme.css"; @tailwind utilities;',
        candidates: ["text-red-500"],
      }),
    ).rejects.toThrow("no loadStylesheet resolver");
  });
});
