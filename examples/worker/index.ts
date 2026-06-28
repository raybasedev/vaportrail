import { compile, composeCaches, kvCache, memoryCache } from "@raybase/vaportrail/cloudflare";

export interface Env {
  VAPORTRAIL_KV?: KVNamespace;
  VAPORTRAIL_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("authorization") !== `Bearer ${env.VAPORTRAIL_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as {
      html: string;
      css: string;
    };

    const caches = env.VAPORTRAIL_KV
      ? composeCaches(memoryCache(), kvCache(env.VAPORTRAIL_KV))
      : memoryCache();

    const result = await compile({
      css: body.css,
      sources: [{ kind: "text", content: body.html, extension: "html" }],
      emit: "runtime",
      cache: caches,
    });

    return new Response(result.css, {
      headers: {
        "content-type": "text/css; charset=utf-8",
        etag: result.hash,
      },
    });
  },
};
