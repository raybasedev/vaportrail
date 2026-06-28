import { initSync, scan_content_json } from "./generated/vaportrail_extractor_wasm.js";
import { wasmBase64 } from "./generated/wasm-bytes.js";

let initialized = false;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function scanWithWasm(content: string, extension: string): string[] {
  if (!initialized) {
    initSync({ module: decodeBase64(wasmBase64) });
    initialized = true;
  }

  const raw = scan_content_json(content, extension);
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Vaportrail extractor returned malformed candidate data.");
  }

  return parsed;
}
