import { access, mkdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const generatedDir = join(root, "src", "extractor", "generated");

async function run(command, args, options = {}) {
  const child = execFileAsync(command, args, {
    cwd: root,
    maxBuffer: 1024 * 1024 * 64,
    ...options,
  });
  const { stdout, stderr } = await child;
  if (stdout.trim()) process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
  return { stdout, stderr };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function commandOutput(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, { cwd: root });
    return stdout.trim();
  } catch {
    return null;
  }
}

if (!(await exists(join(root, "crates", "vendor", "tailwindcss-oxide", "vendor-metadata.json")))) {
  await run(process.execPath, ["scripts/vendor-tailwind-oxide.mjs"]);
}

await mkdir(generatedDir, { recursive: true });
await run("rustup", ["target", "add", "wasm32-unknown-unknown"]);
await run("cargo", ["build", "-p", "vaportrail-extractor-wasm", "--target", "wasm32-unknown-unknown", "--release"]);

const wasmBindgenVersion = await readCargoPackageVersion("wasm-bindgen");
const actualBindgen = await commandOutput("wasm-bindgen", ["--version"]);
if (!actualBindgen?.includes(wasmBindgenVersion)) {
  throw new Error(
    `wasm-bindgen CLI ${wasmBindgenVersion} is required. Install it with: cargo install wasm-bindgen-cli --version ${wasmBindgenVersion}`,
  );
}

const wasmInput = join(root, "target", "wasm32-unknown-unknown", "release", "vaportrail_extractor_wasm.wasm");
await run("wasm-bindgen", [
  wasmInput,
  "--target",
  "web",
  "--out-dir",
  generatedDir,
  "--out-name",
  "vaportrail_extractor_wasm",
]);

const wasmOutput = join(generatedDir, "vaportrail_extractor_wasm_bg.wasm");
const wasmOpt = join(root, "node_modules", ".bin", process.platform === "win32" ? "wasm-opt.cmd" : "wasm-opt");
if (await exists(wasmOpt)) {
  await run(wasmOpt, ["-Oz", wasmOutput, "-o", wasmOutput]);
} else {
  const globalWasmOpt = await commandOutput("wasm-opt", ["--version"]);
  if (globalWasmOpt) {
    await run("wasm-opt", ["-Oz", wasmOutput, "-o", wasmOutput]);
  } else {
    console.warn("wasm-opt is unavailable; skipping local optimization.");
  }
}

await run(process.execPath, ["scripts/embed-wasm.mjs"]);

const size = await stat(wasmOutput);
console.log(`Built extractor WASM: ${size.size} bytes`);

async function readCargoPackageVersion(packageName) {
  const lockfile = await readFile(join(root, "Cargo.lock"), "utf8");
  const packageBlocks = lockfile.split(/\n\[\[package\]\]\n/);

  for (const block of packageBlocks) {
    if (block.includes(`name = "${packageName}"`)) {
      const match = block.match(/version = "([^"]+)"/);
      if (match) return match[1];
    }
  }

  throw new Error(`Could not find ${packageName} in Cargo.lock.`);
}
