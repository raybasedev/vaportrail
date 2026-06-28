import { compile as compileTailwind } from "tailwindcss";
import { applyEmitPolicy, normalizeEmitPolicy } from "./emit.js";
import { hashJson, sha256Hex, stableStringify } from "./hash.js";
import { createStylesheetLoader } from "./stylesheet.js";
import {
  extractorVersion,
  tailwindVendorSha,
  tailwindVendorVersion,
} from "../extractor/generated/vendor-metadata.js";
import type { CompileInput, CompileResult, ScanInput, Source } from "./types.js";

export type ExtractorRuntime = {
  scanText(content: string, options?: { extension?: string }): string[];
  uniqueSorted(values: Iterable<string>): string[];
};

const packageVersion = "0.0.0";
const tailwindNpmVersion = "4.3.1";

export function createCompiler(runtime: ExtractorRuntime) {
  async function scan(input: ScanInput): Promise<{ candidates: string[] }> {
    return { candidates: scanSync(input) };
  }

  async function compile(input: CompileInput): Promise<CompileResult> {
    if (typeof input.css !== "string") {
      throw new TypeError("compile(input) requires a CSS string.");
    }

    const candidates = scanSync(input);
    const emitPolicy = normalizeEmitPolicy(input.emit);
    const stylesheet = createStylesheetLoader(input.loadStylesheet);
    const builder = await compileTailwind(input.css, {
      base: input.base ?? "/",
      loadStylesheet: stylesheet.loadStylesheet,
    });

    const cacheKey = await hashJson({
      namespace: "vaportrail.compile",
      packageVersion,
      extractorVersion,
      tailwindNpmVersion,
      tailwindVendorVersion,
      tailwindVendorSha,
      rootCssHash: await sha256Hex(input.css),
      stylesheets: stylesheet.records,
      emitPolicy,
      candidates,
    });

    const cached = await input.cache?.get(cacheKey);
    if (cached && isCachedResult(cached) && cached.cacheKey === cacheKey) {
      return cached;
    }

    const fullCss = builder.build(candidates);
    const css = applyEmitPolicy(fullCss, emitPolicy);
    const hash = await sha256Hex(css);
    const result = { css, candidates, hash, cacheKey };

    await input.cache?.put(cacheKey, result);
    return result;
  }

  function scanSync(input: ScanInput): string[] {
    const candidates: string[] = [];

    for (const source of input.sources ?? []) {
      candidates.push(...scanSource(source));
    }

    candidates.push(...(input.candidates ?? []));

    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        throw new TypeError("Candidates must be strings.");
      }
    }

    return runtime.uniqueSorted(candidates);
  }

  function scanSource(source: Source): string[] {
    if (source.kind === "text") {
      return runtime.scanText(source.content, { extension: source.extension });
    }

    if (source.kind === "candidates") {
      return source.candidates;
    }

    throw new TypeError(`Unsupported Vaportrail source: ${stableStringify(source)}`);
  }

  return { compile, scan };
}

function isCachedResult(value: unknown): value is CompileResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Record<string, unknown>;
  return (
    typeof result.css === "string" &&
    typeof result.hash === "string" &&
    typeof result.cacheKey === "string" &&
    Array.isArray(result.candidates) &&
    result.candidates.every((candidate) => typeof candidate === "string")
  );
}
