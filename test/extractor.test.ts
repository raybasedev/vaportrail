import { Scanner } from "@tailwindcss/oxide";
import { describe, expect, test } from "vitest";
import { scan } from "../src/extractor/index.js";

const fixtures = [
  {
    extension: "html",
    content: '<div class="text-red-500 hover:bg-blue-100 [margin:2px]"></div>',
  },
  {
    extension: "tsx",
    content: 'export function Card(){ return <div className="grid sm:grid-cols-2 data-[state=open]:opacity-100" /> }',
  },
  {
    extension: "liquid",
    content: '<div class="px-4 {{ active | default: \'opacity-50\' }} md:hover:underline"></div>',
  },
  {
    extension: "html",
    content: "const styles = { active: 'font-bold', inactive: 'text-slate-500' }",
  },
];

describe("extractor", () => {
  test.each(fixtures)("matches @tailwindcss/oxide for $extension content", ({ content, extension }) => {
    const scanner = new Scanner({ sources: [] });
    expect(scan(content, { extension })).toEqual(scanner.scanFiles([{ content, extension }]).sort());
  });

  test("validates content", () => {
    expect(() => scan(123 as never)).toThrow("requires a string");
  });
});
