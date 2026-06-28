import type { StylesheetLoader } from "../compiler/types.js";

export type R2StylesheetLoaderOptions = {
  prefix?: string;
  fallback?: StylesheetLoader;
};

export async function loadCssFromR2(bucket: R2Bucket, key: string): Promise<string | null> {
  const object = await bucket.get(key);
  return object?.text() ?? null;
}

export function r2StylesheetLoader(
  bucket: R2Bucket,
  options: R2StylesheetLoaderOptions = {},
): StylesheetLoader {
  const prefix = options.prefix ?? "";

  return async (id, base) => {
    const content = await loadCssFromR2(bucket, `${prefix}${id}`);
    if (content !== null) return content;
    return options.fallback?.(id, base) ?? null;
  };
}
