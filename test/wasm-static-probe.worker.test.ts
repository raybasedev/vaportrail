import { describe, expect, test } from "vitest";
import { initSync, scan_content_json } from "../src/extractor/generated/vaportrail_extractor_wasm.js";
import wasmModule from "../src/extractor/generated/vaportrail_extractor_wasm_bg.wasm";

describe("static wasm probe", () => {
  test("instantiates imported wasm module", () => {
    initSync({ module: wasmModule });
    expect(JSON.parse(scan_content_json('<div class="text-red-500"></div>', "html"))).toContain("text-red-500");
  });
});
