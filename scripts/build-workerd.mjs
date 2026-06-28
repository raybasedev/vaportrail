import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const generatedSource = new URL("../src/extractor/generated/", import.meta.url);
const workerdRoot = new URL("../dist/workerd/", import.meta.url);
const metadata = JSON.parse(
  await readFile(new URL("../crates/vendor/tailwindcss-oxide/vendor-metadata.json", import.meta.url), "utf8"),
);

await mkdir(new URL("extractor/generated/", workerdRoot), { recursive: true });
await mkdir(new URL("compiler/", workerdRoot), { recursive: true });
await mkdir(new URL("cloudflare/", workerdRoot), { recursive: true });
await mkdir(new URL("worker/", workerdRoot), { recursive: true });

for (const file of ["vaportrail_extractor_wasm.js", "vaportrail_extractor_wasm_bg.wasm"]) {
  await cp(new URL(file, generatedSource), new URL(`extractor/generated/${file}`, workerdRoot), {
    force: true,
  });
}

await writeFile(
  new URL("extractor/generated/vendor-metadata.js", workerdRoot),
  [
    "export const extractorVersion = \"0.0.0\";",
    `export const tailwindVendorVersion = ${JSON.stringify(metadata.tailwindVersion)};`,
    `export const tailwindVendorSha = ${JSON.stringify(metadata.tailwindSha)};`,
    `export const tailwindVendorTag = ${JSON.stringify(metadata.tailwindTag)};`,
    "",
  ].join("\n"),
);

await writeFile(
  new URL("extractor/index.js", workerdRoot),
  `import { initSync, scan_content_json } from "./generated/vaportrail_extractor_wasm.js";
import wasmModule from "./generated/vaportrail_extractor_wasm_bg.wasm";
export { extractorVersion, tailwindVendorSha, tailwindVendorVersion } from "./generated/vendor-metadata.js";

let initialized = false;

export function scan(content, options = {}) {
  if (typeof content !== "string") {
    throw new TypeError("scan(content) requires a string.");
  }

  if (!initialized) {
    initSync({ module: wasmModule });
    initialized = true;
  }

  const parsed = JSON.parse(scan_content_json(content, options.extension ?? "html"));
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Vaportrail extractor returned malformed candidate data.");
  }

  return uniqueSorted(parsed);
}

export function uniqueSorted(values) {
  return [...new Set(values)].sort();
}
`,
);

await writeFile(
  new URL("compiler/index.js", workerdRoot),
  `import { createCompiler } from "../../compiler/core.js";
import { scan as scanText, uniqueSorted } from "../extractor/index.js";
export { applyEmitPolicy, normalizeEmitPolicy, createCompiler, hashJson, sha256Hex, stableStringify } from "../../compiler/index.js";

const compiler = createCompiler({ scanText, uniqueSorted });
export const scan = compiler.scan;
export const compile = compiler.compile;
`,
);

await writeFile(
  new URL("cloudflare/index.js", workerdRoot),
  `export { compile, scan } from "../compiler/index.js";
export { cacheApiCache, composeCaches, kvCache, memoryCache, r2Cache } from "../../cloudflare/index.js";
export { kvStylesheetLoader, loadCssFromKV } from "../../cloudflare/index.js";
export { loadCssFromR2, r2StylesheetLoader } from "../../cloudflare/index.js";
`,
);

await writeFile(
  new URL("worker/index.js", workerdRoot),
  `import { compile, scan } from "../compiler/index.js";
import { cacheApiCache, composeCaches, kvCache, memoryCache, r2Cache } from "../../cloudflare/index.js";

const bodyLimitBytes = 512 * 1024;
const sourceLimitBytes = 256 * 1024;
const cssLimitBytes = 128 * 1024;
const candidateLimit = 10000;
const cssByHash = new Map();
const localMemoryCache = memoryCache();

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/scan") {
    const input = await readJson(request);
    enforceScanLimits(input);
    return json(await scan(input));
  }

  if (request.method === "POST" && url.pathname === "/compile") {
    const auth = requireBearerToken(request, env.VAPORTRAIL_SECRET);
    if (auth) return auth;

    const input = await readJson(request);
    enforceCompileLimits(input);
    const result = await compile({ ...input, cache: cacheForEnv(env) });
    cssByHash.set(result.hash, result.css);
    await env.VAPORTRAIL_KV?.put(\`css:\${result.hash}\`, result.css);
    return json(result);
  }

  if (request.method === "GET" && url.pathname.startsWith("/css/")) {
    const hash = url.pathname.slice("/css/".length);
    const css = cssByHash.get(hash) ?? (await env.VAPORTRAIL_KV?.get(\`css:\${hash}\`)) ?? null;
    if (css === null) return new Response("Not found", { status: 404 });
    return new Response(css, {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "text/css; charset=utf-8",
      },
    });
  }

  return new Response("Not found", { status: 404 });
}

export default {
  fetch: handleRequest,
  async scan(input) {
    enforceScanLimits(input);
    return scan(input);
  },
  async compile(input, env = {}) {
    enforceCompileLimits(input);
    const result = await compile({ ...input, cache: cacheForEnv(env) });
    cssByHash.set(result.hash, result.css);
    return result;
  },
};

function cacheForEnv(env) {
  const cachesToUse = [localMemoryCache];
  if (typeof caches !== "undefined") cachesToUse.push(cacheApiCache(caches.default));
  if (env.VAPORTRAIL_KV) cachesToUse.push(kvCache(env.VAPORTRAIL_KV));
  if (env.VAPORTRAIL_R2) cachesToUse.push(r2Cache(env.VAPORTRAIL_R2));
  return composeCaches(...cachesToUse);
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > bodyLimitBytes) throw new Response("Request body too large.", { status: 413 });
  return request.json();
}

function enforceScanLimits(input) {
  let sourceBytes = 0;
  let candidates = input.candidates?.length ?? 0;
  for (const source of input.sources ?? []) {
    if (source.kind === "text") sourceBytes += new TextEncoder().encode(source.content).byteLength;
    else candidates += source.candidates.length;
  }
  if (sourceBytes > sourceLimitBytes) throw new Response("Source content too large.", { status: 413 });
  if (candidates > candidateLimit) throw new Response("Too many explicit candidates.", { status: 413 });
}

function enforceCompileLimits(input) {
  enforceScanLimits(input);
  if (new TextEncoder().encode(input.css).byteLength > cssLimitBytes) {
    throw new Response("CSS input too large.", { status: 413 });
  }
}

function requireBearerToken(request, expected) {
  if (!expected) return new Response("VAPORTRAIL_SECRET is not configured.", { status: 500 });
  return request.headers.get("authorization") === \`Bearer \${expected}\` ? null : new Response("Unauthorized", { status: 401 });
}

function json(value, init) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init?.headers },
  });
}
`,
);

console.log("Built workerd conditional exports.");
