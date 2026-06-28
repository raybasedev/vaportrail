import type { StylesheetLoader } from "../compiler/types.js";

export type KVStylesheetLoaderOptions = {
  prefix?: string;
  fallback?: StylesheetLoader;
};

export async function loadCssFromKV(namespace: KVNamespace, key: string): Promise<string | null> {
  return namespace.get(key);
}

export function kvStylesheetLoader(
  namespace: KVNamespace,
  options: KVStylesheetLoaderOptions = {},
): StylesheetLoader {
  const prefix = options.prefix ?? "";

  return async (id, base) => {
    const key = `${prefix}${id}`;
    const content = await namespace.get(key);
    if (content !== null) return content;
    return options.fallback?.(id, base) ?? null;
  };
}
