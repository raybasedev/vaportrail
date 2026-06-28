import { compile, scan } from "../compiler/index.js";
import type { CompileCache, CompileInput, CompileResult, ScanInput } from "../compiler/types.js";
import { cacheApiCache, composeCaches, kvCache, memoryCache, r2Cache } from "../cloudflare/caches.js";
import { requireBearerToken } from "./auth.js";

export type VaportrailWorkerEnv = {
  VAPORTRAIL_SECRET?: string;
  VAPORTRAIL_KV?: KVNamespace;
  VAPORTRAIL_R2?: R2Bucket;
};

const bodyLimitBytes = 512 * 1024;
const sourceLimitBytes = 256 * 1024;
const cssLimitBytes = 128 * 1024;
const candidateLimit = 10_000;
const cssByHash = new Map<string, string>();
const localMemoryCache = memoryCache();

export async function handleRequest(request: Request, env: VaportrailWorkerEnv = {}): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/scan") {
    const input = await readJson<ScanInput>(request);
    enforceScanLimits(input);
    return json(await scan(input));
  }

  if (request.method === "POST" && url.pathname === "/compile") {
    const auth = requireBearerToken(request, env.VAPORTRAIL_SECRET);
    if (auth) return auth;

    const input = await readJson<CompileInput>(request);
    enforceCompileLimits(input);
    const result = await compile({
      ...input,
      cache: cacheForEnv(env),
    });
    cssByHash.set(result.hash, result.css);
    await env.VAPORTRAIL_KV?.put(`css:${result.hash}`, result.css);
    return json(result);
  }

  if (request.method === "GET" && url.pathname.startsWith("/css/")) {
    const hash = url.pathname.slice("/css/".length);
    const css = cssByHash.get(hash) ?? (await env.VAPORTRAIL_KV?.get(`css:${hash}`)) ?? null;
    if (css === null) {
      return new Response("Not found", { status: 404 });
    }

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
  async scan(input: ScanInput) {
    enforceScanLimits(input);
    return scan(input);
  },
  async compile(input: CompileInput, env?: VaportrailWorkerEnv): Promise<CompileResult> {
    enforceCompileLimits(input);
    const result = await compile({ ...input, cache: cacheForEnv(env ?? {}) });
    cssByHash.set(result.hash, result.css);
    return result;
  },
};

function cacheForEnv(env: VaportrailWorkerEnv): CompileCache {
  const cachesToUse: CompileCache[] = [localMemoryCache];

  if (typeof caches !== "undefined") {
    cachesToUse.push(cacheApiCache((caches as unknown as { default: Cache }).default));
  }

  if (env.VAPORTRAIL_KV) {
    cachesToUse.push(kvCache(env.VAPORTRAIL_KV));
  }

  if (env.VAPORTRAIL_R2) {
    cachesToUse.push(r2Cache(env.VAPORTRAIL_R2));
  }

  return composeCaches(...cachesToUse);
}

async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > bodyLimitBytes) {
    throw new Response("Request body too large.", { status: 413 });
  }

  return (await request.json()) as T;
}

function enforceScanLimits(input: ScanInput): void {
  let sourceBytes = 0;
  let candidates = input.candidates?.length ?? 0;

  for (const source of input.sources ?? []) {
    if (source.kind === "text") {
      sourceBytes += new TextEncoder().encode(source.content).byteLength;
    } else {
      candidates += source.candidates.length;
    }
  }

  if (sourceBytes > sourceLimitBytes) {
    throw new Response("Source content too large.", { status: 413 });
  }

  if (candidates > candidateLimit) {
    throw new Response("Too many explicit candidates.", { status: 413 });
  }
}

function enforceCompileLimits(input: CompileInput): void {
  enforceScanLimits(input);

  if (new TextEncoder().encode(input.css).byteLength > cssLimitBytes) {
    throw new Response("CSS input too large.", { status: 413 });
  }
}

function json(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}
