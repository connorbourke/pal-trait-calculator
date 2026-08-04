#!/usr/bin/env node
/**
 * Scrape field (non-tower) alpha bosses + levels from palworld.tools.
 * Writes data/field-alphas.json for normalize-data.mjs.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "data", "field-alphas.json");
const SOURCE_URL = "https://www.palworld.tools/bosses";

const CARD_RE =
  /href="\/pals\/([a-z0-9-]+)-alpha"[^>]*>[\s\S]*?font-bold[^>]*>([^<]+)<\/span>[\s\S]*?Lv <!-- -->(\d+)/gi;

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${res.status}`);
  }
  const html = await res.text();

  /** @type {Map<string, { slug: string, name: string, levels: Set<number> }>} */
  const bySlug = new Map();
  for (const match of html.matchAll(CARD_RE)) {
    const slug = match[1].toLowerCase();
    const name = match[2].trim();
    const level = Number(match[3]);
    if (!name || !Number.isFinite(level)) continue;
    let entry = bySlug.get(slug);
    if (!entry) {
      entry = { slug, name, levels: new Set() };
      bySlug.set(slug, entry);
    }
    entry.levels.add(level);
    // Prefer longer / more complete display name if duplicates differ
    if (name.length > entry.name.length) entry.name = name;
  }

  if (bySlug.size < 50) {
    throw new Error(
      `Parsed only ${bySlug.size} field alphas — page markup may have changed`,
    );
  }

  const alphas = [...bySlug.values()]
    .map((entry) => {
      const levels = [...entry.levels].sort((a, b) => a - b);
      return {
        name: entry.name,
        slug: entry.slug,
        minLevel: levels[0],
        levels,
      };
    })
    .sort(
      (a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name),
    );

  const payload = {
    source: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    note: "Field (non-tower) alpha boss spawns from game FieldBoss data, via palworld.tools. Multiple map spots for one species keep the lowest level.",
    count: alphas.length,
    alphas,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${alphas.length} field alphas → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
