#!/usr/bin/env node
/**
 * Bake favicons from scripts/favicon-sources/electric-incubator-draft.png
 *
 * Draft-first (same idea as pets): high-res stylized draft → knock out black bg →
 * Lanczos down to 16/32/180 + ico. Tuned for recognition at tab size.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "scripts/favicon-sources/egg-incubator-draft.png");
const out = join(root, "public");
const preview = join(root, "scripts/favicon-sources/favicon-32-preview.png");

if (!existsSync(src)) {
  console.error("Missing", src);
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const convertBin =
  spawnSync("which", ["convert"], { encoding: "utf8" }).stdout.trim() ||
  "convert";

function run(args) {
  const r = spawnSync(convertBin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `convert failed: ${args.join(" ")}`);
    process.exit(r.status || 1);
  }
}

const f16 = join(out, "favicon-16.png");
const f32 = join(out, "favicon-32.png");
const apple = join(out, "apple-touch-icon.png");
const ico = join(out, "favicon.ico");
const trimmed = join(root, "scripts/favicon-sources/_trimmed.png");

run([
  src,
  "-alpha",
  "set",
  "-fuzz",
  "12%",
  "-transparent",
  "black",
  "-trim",
  "+repage",
  trimmed,
]);

run([
  trimmed,
  "-resize",
  "32x32>",
  "-background",
  "none",
  "-gravity",
  "center",
  "-extent",
  "32x32",
  "-unsharp",
  "0x0.7+0.9+0.02",
  f32,
]);

run([
  trimmed,
  "-resize",
  "16x16>",
  "-background",
  "none",
  "-gravity",
  "center",
  "-extent",
  "16x16",
  "-unsharp",
  "0x0.5+0.8+0.02",
  f16,
]);

run([
  trimmed,
  "-resize",
  "180x180>",
  "-background",
  "none",
  "-gravity",
  "center",
  "-extent",
  "180x180",
  apple,
]);

run([f16, f32, ico]);
run([f32, "-filter", "point", "-resize", "256x256", preview]);
try {
  unlinkSync(trimmed);
} catch {
  /* ignore */
}

console.log("favicon 16/32/180 + ico from egg-incubator-draft.png");
