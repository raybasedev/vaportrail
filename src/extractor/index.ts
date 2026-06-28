import { scanWithWasm } from "./wasm.js";
export { extractorVersion, tailwindVendorSha, tailwindVendorVersion } from "./generated/vendor-metadata.js";

export type ScanOptions = {
  extension?: string;
};

export function scan(content: string, options: ScanOptions = {}): string[] {
  if (typeof content !== "string") {
    throw new TypeError("scan(content) requires a string.");
  }

  const extension = options.extension ?? "html";
  return uniqueSorted(scanWithWasm(content, extension));
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}
