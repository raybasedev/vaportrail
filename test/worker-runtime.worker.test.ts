import { describe, expect, test } from "vitest";
describe("Worker runtime smoke", () => {
  test("loads the embedded extractor and compiles Tailwind CSS", async () => {
    const extractorPath = "../dist/workerd/extractor/index.js";
    const compilerPath = "../dist/workerd/compiler/index.js";
    const { scan } = await import(extractorPath);
    const { compile } = await import(compilerPath);

    expect(scan('<div class="text-red-500"></div>')).toContain("text-red-500");

    const result = await compile({
      css: "@theme { --color-red-500: oklch(63.7% 0.237 25.331); } @tailwind utilities;",
      candidates: ["text-red-500"],
      emit: "full",
    });

    expect(result.css).toContain(".text-red-500");
    expect(result.hash).toHaveLength(64);
  });
});
