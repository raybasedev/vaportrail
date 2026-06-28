# Vaportrail

Worker-compatible runtime Tailwind scanning and compilation for Cloudflare Workers.

`@raybase/vaportrail` turns runtime-authored strings or explicit Tailwind candidates into a stable candidate list, and can optionally compile those candidates into CSS from a caller-provided Tailwind v4 CSS entry.

It is intended for Workers apps that render or publish runtime content, including CMS pages, user-authored templates, AI-generated HTML, white-label pages, and template publishing flows.

## Features

- Worker-safe Tailwind candidate extraction through a custom WASM wrapper around Tailwind v4's Rust extractor.
- Tailwind v4 `compile().build(candidates)` orchestration from raw strings or explicit candidates.
- Caller-provided Tailwind CSS entry, with optional stylesheet import resolution.
- `emit: "full"`, `emit: "runtime"`, and custom layer-aware emit policies.
- Stable SHA-256 `hash` and semantic `cacheKey` values.
- Optional compiler cache hooks.
- Cloudflare Cache API, KV, R2, and in-memory cache helpers.
- Optional reference Worker with `/scan`, `/compile`, `/css/:hash`, and `/health` endpoints.

## Install

```sh
npm install @raybase/vaportrail
```

## Quick Start

```ts
import { compile } from "@raybase/vaportrail/cloudflare";

export default {
  async fetch(request: Request) {
    const html = await request.text();

    const result = await compile({
      css: "@theme { --color-red-500: oklch(63.7% 0.237 25.331); } @tailwind utilities;",
      sources: [{ kind: "text", content: html, extension: "html" }],
      emit: "runtime",
    });

    return new Response(result.css, {
      headers: {
        "content-type": "text/css; charset=utf-8",
        etag: result.hash,
      },
    });
  },
};
```

Runtime compilation should be cached. Large CSS entries or large candidate sets can exceed normal Worker CPU budgets.

## Entry Points

### `@raybase/vaportrail/extractor`

Scan a single string with the WASM extractor.

```ts
import { scan } from "@raybase/vaportrail/extractor";

const candidates = scan('<section class="grid md:grid-cols-2"></section>', {
  extension: "html",
});
```

### `@raybase/vaportrail/compiler`

Scan multiple sources and optionally compile CSS.

```ts
import { compile, scan } from "@raybase/vaportrail/compiler";

const scanned = await scan({
  sources: [{ kind: "text", content: '<div class="text-red-500"></div>' }],
  candidates: ["hover:bg-blue-100"],
});

const result = await compile({
  css: "@theme { --spacing: 0.25rem; } @tailwind utilities;",
  candidates: ["p-4"],
  emit: "full",
});
```

### `@raybase/vaportrail/cloudflare`

Worker-friendly entrypoint. Re-exports `scan` and `compile`, plus Cloudflare cache and storage helpers.

```ts
import { compile, composeCaches, kvCache, memoryCache } from "@raybase/vaportrail/cloudflare";

export interface Env {
  CSS_CACHE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env) {
    const result = await compile({
      css: "@theme { --color-brand: oklch(62% 0.18 240); } @tailwind utilities;",
      sources: [{ kind: "text", content: await request.text() }],
      emit: "runtime",
      cache: composeCaches(memoryCache(), kvCache(env.CSS_CACHE)),
    });

    return new Response(result.css, {
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  },
};
```

### `@raybase/vaportrail/worker`

Reference Worker implementation. It is provided as a deployment pattern, not as a required integration path.

```ts
export { default } from "@raybase/vaportrail/worker";
```

The reference Worker exposes:

- `GET /health`
- `POST /scan`
- `POST /compile`
- `GET /css/:hash`

`POST /compile` requires `Authorization: Bearer <VAPORTRAIL_SECRET>`.

## API

```ts
type Source =
  | { kind: "text"; content: string; extension?: string }
  | { kind: "candidates"; candidates: string[] };

type EmitPolicy =
  | "full"
  | "runtime"
  | {
      theme?: "all" | false;
      base?: boolean;
      components?: boolean;
      utilities?: boolean;
      properties?: boolean;
    };

type CompileInput = {
  sources?: Source[];
  candidates?: string[];
  css: string;
  base?: string;
  loadStylesheet?: (
    id: string,
    base: string,
  ) => Promise<string | null> | string | null;
  emit?: EmitPolicy;
  cache?: {
    get(key: string): Promise<CachedResult | null>;
    put(key: string, value: CachedResult): Promise<void>;
  };
};
```

`compile(input)` returns:

```ts
{
  css: string;
  candidates: string[];
  hash: string;
  cacheKey: string;
}
```

`hash` is derived from the emitted CSS. `cacheKey` is derived from semantic inputs including Tailwind version, extractor version, CSS/import content, emit policy, and sorted candidates.

## CSS Source And Imports

Pass the normal Tailwind CSS source you want Vaportrail to compile from:

```ts
await compile({
  css: "@theme { --color-accent: oklch(70% 0.2 160); } @tailwind utilities;",
  candidates: ["text-accent"],
  emit: "runtime",
});
```

If your CSS uses `@import`, provide `loadStylesheet`. Vaportrail adapts the string resolver to Tailwind's `{ path, base, content }` loader shape and includes imported content hashes in `cacheKey`.

```ts
await compile({
  css: '@import "./theme.css" layer(theme); @tailwind utilities;',
  base: "/styles/app.css",
  candidates: ["text-brand"],
  loadStylesheet(id, base) {
    return env.CSS_SOURCES.get(`${base}/${id}`);
  },
});
```

## Emit Policies

`emit: "full"` returns Tailwind's compiled output unchanged.

`emit: "runtime"` is intended for runtime-authored template CSS when the host app already serves global CSS. It keeps:

- full theme variables
- generated utilities for the scanned candidates
- top-level `@property` rules

It drops:

- base/preflight reset CSS
- component/global CSS
- unlayered global rules

Custom policies can toggle `theme`, `base`, `components`, `utilities`, and `properties`.

```ts
await compile({
  css,
  sources,
  emit: {
    theme: "all",
    base: false,
    components: false,
    utilities: true,
    properties: true,
  },
});
```

`theme: "used"` is not implemented.

## Cloudflare Helpers

`@raybase/vaportrail/cloudflare` exports:

- `memoryCache()`
- `cacheApiCache(caches.default)`
- `kvCache(namespace)`
- `r2Cache(bucket)`
- `composeCaches(...caches)`
- `loadCssFromKV(namespace, key)`
- `kvStylesheetLoader(namespace, options?)`
- `loadCssFromR2(bucket, key)`
- `r2StylesheetLoader(bucket, options?)`

The Cache API is regional. KV and R2 are better for reusable content-hashed CSS across regions.

## Worker WASM Packaging

The default ESM import embeds WASM bytes for Node and bundler compatibility.

The package export map also provides `workerd` conditions that import the `.wasm` module statically. This is required by workerd because runtime WASM code generation is blocked in Cloudflare Workers.

When deploying the reference Worker from this repository, build first and deploy the generated workerd entrypoint:

```jsonc
{
  "main": "dist/workerd/worker/index.js",
  "rules": [
    {
      "type": "CompiledWasm",
      "globs": ["**/*.wasm"],
      "fallthrough": false
    }
  ]
}
```

## Reference Worker Deployment

```sh
npm run build
npx wrangler secret put VAPORTRAIL_SECRET
npx wrangler deploy
```

Smoke test:

```sh
curl https://<worker>.workers.dev/health

curl -X POST https://<worker>.workers.dev/scan \
  -H 'content-type: application/json' \
  --data '{"sources":[{"kind":"text","content":"<div class=\"text-red-500\"></div>"}]}'
```

Authenticated compile:

```sh
curl -X POST https://<worker>.workers.dev/compile \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $VAPORTRAIL_SECRET" \
  --data '{
    "css": "@theme { --color-red-500: oklch(63.7% 0.237 25.331); } @tailwind utilities;",
    "sources": [{"kind": "text", "content": "<div class=\"text-red-500\"></div>"}],
    "emit": "full"
  }'
```

## Limitations

- Dynamic class construction has the same constraints as Tailwind scanning generally: complete class strings must appear somewhere, or callers must pass explicit candidates.
- Runtime Tailwind compilation can be CPU-heavy for large candidate sets or large CSS entries.
- Vaportrail does not load arbitrary Tailwind config or plugin modules from public requests.
- CSS entries that depend on Node/Vite-only plugins or filesystem behavior should be compiled elsewhere or resolved into plain CSS/import strings before reaching Vaportrail.
- Deployed compile endpoints should be authenticated and rate-limited.

## Development

```sh
npm install
npm run check:vendor
npm run build
npm test
npm run pack:dry
```

The Rust extractor vendors Tailwind `v4.3.1` and builds to `wasm32-unknown-unknown`.

## License

MIT
