import { describe, expect, test } from "vitest";
import { compile } from "../src/compiler/index.js";
import { nodeTailwindStylesheetLoader } from "./fixtures/tailwind.js";

describe("emit policy", () => {
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
