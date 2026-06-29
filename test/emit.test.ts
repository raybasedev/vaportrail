import { describe, expect, test } from "vitest";
import { compile } from "../src/compiler/index.js";
import { nodeTailwindStylesheetLoader } from "./fixtures/tailwind.js";

describe("emit policy", () => {
  test("runtime output keeps top-level utilities emitted by @tailwind utilities", async () => {
    const result = await compile({
      css: "@theme { --color-brand-500: oklch(62% 0.18 240); } @tailwind utilities;",
      sources: [{ kind: "text", content: '<div class="bg-brand-500 mt-[13px]"></div>' }],
      candidates: ["sr-only"],
      emit: "runtime",
    });

    expect(result.candidates).toEqual(["bg-brand-500", "class", "mt-[13px]", "sr-only"]);
    expect(result.css).toContain("--color-brand-500");
    expect(result.css).toContain(".bg-brand-500");
    expect(result.css).toContain(".mt-\\[13px\\]");
    expect(result.css).toContain(".sr-only");
  });

  test("runtime output drops unlayered globals while keeping generated top-level utilities", async () => {
    const result = await compile({
      css: `
        @theme { --color-brand-500: oklch(62% 0.18 240); }
        @tailwind utilities;
        .global-component { color: red; }
      `,
      candidates: ["bg-brand-500"],
      emit: "runtime",
    });

    expect(result.css).toContain(".bg-brand-500");
    expect(result.css).not.toContain(".global-component");
  });

  test("custom policies treat mixed root rules as components", async () => {
    const result = await compile({
      css: ":root { color-scheme: light; --app-token: red; } @tailwind utilities;",
      emit: {
        theme: false,
        base: false,
        components: true,
        utilities: false,
        properties: false,
      },
    });

    expect(result.css).toContain("color-scheme: light");
    expect(result.css).toContain("--app-token: red");
  });

  test("runtime output keeps theme/properties/utilities and drops base/global CSS", async () => {
    const result = await compile({
      css: `
        @import "tailwindcss/theme.css" layer(theme);
        @import "tailwindcss/preflight.css" layer(base);
        @import "tailwindcss/utilities.css" layer(utilities);
        .global-component { color: red; }
      `,
      candidates: ["text-red-500", "translate-x-4"],
      loadStylesheet: nodeTailwindStylesheetLoader,
      emit: "runtime",
    });

    expect(result.css).toContain("@layer theme");
    expect(result.css).toContain("@layer utilities");
    expect(result.css).toContain("--color-red-500");
    expect(result.css).toContain(".text-red-500");
    expect(result.css).toContain("@property --tw-");
    expect(result.css).not.toContain("@layer base");
    expect(result.css).not.toContain(".global-component");
  });
});
