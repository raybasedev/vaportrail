import { readFile } from "node:fs/promises";

const expectedVersion = "4.3.1";
const expectedSha = "8a14a710102cae195f6811e8578bef9477bc6be9";
const metadataUrl = new URL("../crates/vendor/tailwindcss-oxide/vendor-metadata.json", import.meta.url);

let metadata;
try {
  metadata = JSON.parse(await readFile(metadataUrl, "utf8"));
} catch (error) {
  console.error("Tailwind vendor metadata is missing. Run `npm run vendor:tailwind`.");
  throw error;
}

if (metadata.tailwindVersion !== expectedVersion || metadata.tailwindSha !== expectedSha) {
  throw new Error(
    `Vendored Tailwind mismatch. Expected ${expectedVersion} ${expectedSha}, got ${metadata.tailwindVersion} ${metadata.tailwindSha}.`,
  );
}

console.log(`Vendored Tailwind ${metadata.tailwindVersion} ${metadata.tailwindSha} is pinned.`);
