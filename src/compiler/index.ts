import { scan as scanText, uniqueSorted } from "../extractor/index.js";
import { createCompiler } from "./core.js";

export type {
  CachedResult,
  CompileCache,
  CompileInput,
  CompileResult,
  EmitPolicy,
  LoadedStylesheet,
  ResolvedEmitPolicy,
  ScanInput,
  Source,
  StylesheetLoader,
} from "./types.js";
export { createCompiler } from "./core.js";
export { applyEmitPolicy, normalizeEmitPolicy } from "./emit.js";
export { hashJson, sha256Hex, stableStringify } from "./hash.js";

const compiler = createCompiler({ scanText, uniqueSorted });

export const scan = compiler.scan;
export const compile = compiler.compile;
