const textEncoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const cryptoLike = globalThis.crypto;

  if (cryptoLike?.subtle) {
    const digest = await cryptoLike.subtle.digest("SHA-256", textEncoder.encode(input));
    return bytesToHex(new Uint8Array(digest));
  }

  throw new Error("Vaportrail requires Web Crypto SHA-256 support.");
}

export async function hashJson(value: unknown): Promise<string> {
  return sha256Hex(stableStringify(value));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJson((value as Record<string, unknown>)[key]);
    }

    return sorted;
  }

  return value;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
