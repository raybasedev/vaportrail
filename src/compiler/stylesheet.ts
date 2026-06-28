import { sha256Hex } from "./hash.js";
import type { LoadedStylesheet, StylesheetLoader } from "./types.js";

type TailwindStylesheet = {
  path: string;
  base: string;
  content: string;
};

export type StylesheetLoaderShim = {
  records: LoadedStylesheet[];
  loadStylesheet(id: string, base: string): Promise<TailwindStylesheet>;
};

export function createStylesheetLoader(load: StylesheetLoader | undefined): StylesheetLoaderShim {
  const records: LoadedStylesheet[] = [];

  return {
    records,
    async loadStylesheet(id: string, base: string): Promise<TailwindStylesheet> {
      if (!load) {
        throw new Error(
          `Vaportrail cannot resolve stylesheet import "${id}" from "${base}" because no loadStylesheet resolver was provided.`,
        );
      }

      const content = await load(id, base);
      if (content === null) {
        throw new Error(`Vaportrail loadStylesheet returned null for "${id}" from "${base}".`);
      }

      if (typeof content !== "string") {
        throw new TypeError(`Vaportrail loadStylesheet must return a string or null for "${id}".`);
      }

      const resolvedPath = resolveStylesheetPath(id, base);
      const nextBase = dirnamePosix(resolvedPath);
      records.push({
        id,
        resolvedPath,
        base: nextBase,
        contentHash: await sha256Hex(content),
      });

      return { path: resolvedPath, base: nextBase, content };
    },
  };
}

export function resolveStylesheetPath(id: string, base: string): string {
  if (isBareSpecifier(id)) {
    return normalizePosixPath(id);
  }

  if (id.startsWith("/")) {
    return normalizePosixPath(id);
  }

  return normalizePosixPath(`${base || "/"}/${id}`);
}

export function dirnamePosix(path: string): string {
  const normalized = normalizePosixPath(path);
  const index = normalized.lastIndexOf("/");

  if (index <= 0) {
    return "/";
  }

  return normalized.slice(0, index);
}

export function normalizePosixPath(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];

  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (!absolute) {
        parts.push(part);
      }
      continue;
    }

    parts.push(part);
  }

  const joined = parts.join("/");
  return absolute ? `/${joined}` || "/" : joined || ".";
}

function isBareSpecifier(id: string): boolean {
  return !id.startsWith(".") && !id.startsWith("/");
}
