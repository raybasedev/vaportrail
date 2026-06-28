import { describe, expect, test } from "vitest";
import { composeCaches, memoryCache } from "../src/cloudflare/index.js";

describe("Cloudflare cache helpers", () => {
  test("memoryCache stores compile results", async () => {
    const cache = memoryCache();
    const value = { css: ".x{}", candidates: ["x"], hash: "hash", cacheKey: "key" };

    await cache.put("key", value);
    await expect(cache.get("key")).resolves.toEqual(value);
  });

  test("composeCaches reads in order and backfills earlier caches", async () => {
    const first = memoryCache();
    const second = memoryCache([["key", { css: ".x{}", candidates: ["x"], hash: "hash", cacheKey: "key" }]]);

    const composed = composeCaches(first, second);
    const hit = await composed.get("key");

    expect(hit?.hash).toBe("hash");
    await expect(first.get("key")).resolves.toEqual(hit);
  });
});
