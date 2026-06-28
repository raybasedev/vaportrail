import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoUrl = "https://github.com/tailwindlabs/tailwindcss.git";
const version = "4.3.1";
const tag = `v${version}`;
const vendorRoot = new URL("../crates/vendor/tailwindcss-oxide/", import.meta.url);
const metadataUrl = new URL("../src/extractor/generated/vendor-metadata.ts", import.meta.url);
const metadataJsonUrl = new URL("../crates/vendor/tailwindcss-oxide/vendor-metadata.json", import.meta.url);

async function run(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 1024 * 1024 * 32,
    ...options,
  });
  return stdout.trim();
}

async function pathExists(url) {
  try {
    await readFile(url);
    return true;
  } catch {
    return false;
  }
}

const cloneDir = join(tmpdir(), `vaportrail-tailwindcss-${tag}-${Date.now()}`);

await rm(vendorRoot, { recursive: true, force: true });
await mkdir(vendorRoot, { recursive: true });
await mkdir(new URL("../src/extractor/generated/", import.meta.url), { recursive: true });

await run("git", ["clone", "--depth", "1", "--branch", tag, repoUrl, cloneDir]);
const sha = await run("git", ["-C", cloneDir, "rev-parse", "HEAD"]);

for (const crate of ["oxide", "classification-macros", "ignore"]) {
  await cp(join(cloneDir, "crates", crate), new URL(`${crate}/`, vendorRoot), {
    recursive: true,
    force: true,
    filter: (source) => !source.includes("/target/"),
  });
}

const licenseCandidates = ["LICENSE", "LICENSE.md", "COPYING"];
for (const name of licenseCandidates) {
  const source = join(cloneDir, name);
  if (await pathExists(source)) {
    await cp(source, new URL(name, vendorRoot), { force: true });
  }
}

const metadata = {
  tailwindVersion: version,
  tailwindTag: tag,
  tailwindSha: sha,
  source: repoUrl,
  vendoredCrates: ["oxide", "classification-macros", "ignore"],
  generatedAt: new Date().toISOString(),
};

await writeFile(metadataJsonUrl, `${JSON.stringify(metadata, null, 2)}\n`);
await writeFile(
  metadataUrl,
  [
    "export const extractorVersion = \"0.0.0\";",
    `export const tailwindVendorVersion = ${JSON.stringify(version)};`,
    `export const tailwindVendorSha = ${JSON.stringify(sha)};`,
    `export const tailwindVendorTag = ${JSON.stringify(tag)};`,
    "",
  ].join("\n"),
);

await rm(cloneDir, { recursive: true, force: true });

console.log(`Vendored Tailwind ${tag} (${sha}) into ${vendorRoot.pathname}`);
