export type Source =
  | { kind: "text"; content: string; extension?: string }
  | { kind: "candidates"; candidates: string[] };

export type EmitPolicy =
  | "full"
  | "runtime"
  | {
      theme?: "all" | false;
      base?: boolean;
      components?: boolean;
      utilities?: boolean;
      properties?: boolean;
    };

export type ResolvedEmitPolicy = {
  theme: "all" | false;
  base: boolean;
  components: boolean;
  utilities: boolean;
  properties: boolean;
};

export type CachedResult = {
  css: string;
  candidates: string[];
  hash: string;
  cacheKey: string;
};

export type CompileResult = CachedResult;

export type CompileCache = {
  get(key: string): Promise<CachedResult | null>;
  put(key: string, value: CachedResult): Promise<void>;
};

export type StylesheetLoader = (
  id: string,
  base: string,
) => Promise<string | null> | string | null;

export type CompileInput = {
  sources?: Source[];
  candidates?: string[];
  css: string;
  base?: string;
  loadStylesheet?: StylesheetLoader;
  emit?: EmitPolicy;
  cache?: CompileCache;
};

export type ScanInput = Pick<CompileInput, "sources" | "candidates">;

export type LoadedStylesheet = {
  id: string;
  resolvedPath: string;
  base: string;
  contentHash: string;
};
