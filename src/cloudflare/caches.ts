import type { CachedResult, CompileCache } from "../compiler/types.js";

export function memoryCache(initial?: Iterable<[string, CachedResult]>): CompileCache {
  const store = new Map(initial);

  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

export function cacheApiCache(cache: Cache): CompileCache {
  return {
    async get(key) {
      const response = await cache.match(cacheRequest(key));
      if (!response) return null;
      return (await response.json()) as CachedResult;
    },
    async put(key, value) {
      await cache.put(
        cacheRequest(key),
        new Response(JSON.stringify(value), {
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "content-type": "application/json; charset=utf-8",
          },
        }),
      );
    },
  };
}

export function kvCache(namespace: KVNamespace): CompileCache {
  return {
    async get(key) {
      const value = await namespace.get(key, "json");
      return (value as CachedResult | null) ?? null;
    },
    async put(key, value) {
      await namespace.put(key, JSON.stringify(value), {
        metadata: { contentType: "application/json" },
      });
    },
  };
}

export function r2Cache(bucket: R2Bucket): CompileCache {
  return {
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return JSON.parse(await object.text()) as CachedResult;
    },
    async put(key, value) {
      await bucket.put(key, JSON.stringify(value), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      });
    },
  };
}

export function composeCaches(...caches: CompileCache[]): CompileCache {
  return {
    async get(key) {
      for (let index = 0; index < caches.length; index += 1) {
        const hit = await caches[index].get(key);
        if (!hit) continue;

        await Promise.all(caches.slice(0, index).map((cache) => cache.put(key, hit)));
        return hit;
      }

      return null;
    },
    async put(key, value) {
      await Promise.all(caches.map((cache) => cache.put(key, value)));
    },
  };
}

function cacheRequest(key: string): Request {
  return new Request(`https://vaportrail.cache/${encodeURIComponent(key)}`, {
    method: "GET",
  });
}
