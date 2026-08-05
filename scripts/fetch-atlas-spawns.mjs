#!/usr/bin/env node
/**
 * Fetch Palworld Atlas spawn points and derive density signals for acquisition.
 *
 * Source: https://github.com/Awy64/palworld-atlas-data (Steam dedicated-server extract).
 * Raw spawns stay under data/atlas/ (gitignored); compact summary is written to
 * data/spawn-catch-levels.json for normalize-data.mjs.
 *
 * Stores field density (excludes flat Lv80 World Tree shared-pool slots) and
 * all-points density. Normalize blends dump mid toward field density only.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");
const atlasDir = join(dataDir, "atlas");
const mapsDir = join(atlasDir, "maps");
const outPath = join(dataDir, "spawn-catch-levels.json");

const PAGES_BASE = "https://awy64.github.io/palworld-atlas-data/v1";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function isWorldTreePoolFlat80(entry) {
  // Shared World Tree aura table: 72 pals × 21 identical Lv80 slots (1/72 each).
  // Not Wildlife Sanctuary guardian arenas.
  return entry.minLevel === 80 && entry.maxLevel === 80;
}

function weightedMid(entries) {
  let sum = 0;
  let weight = 0;
  for (const e of entries) {
    const wt = e.weight || 1;
    sum += ((e.minLevel + e.maxLevel) / 2) * wt;
    weight += wt;
  }
  if (!weight) return null;
  return { level: Math.round(sum / weight), weight };
}

function summarizePal(entries) {
  let min = Infinity;
  let max = -Infinity;
  const field = [];
  const worldTreePool = [];

  for (const e of entries) {
    min = Math.min(min, e.minLevel);
    max = Math.max(max, e.maxLevel);
    if (isWorldTreePoolFlat80(e)) worldTreePool.push(e);
    else field.push(e);
  }

  if (!Number.isFinite(min)) return null;

  const fieldMid = weightedMid(field);
  const allMid = weightedMid(entries);
  const worldTreePoolWeight = worldTreePool.reduce(
    (n, e) => n + (e.weight || 1),
    0,
  );

  // Prefer field density; fall back to all when a pal is pool-only.
  const densityField = fieldMid?.level ?? allMid?.level ?? null;
  const densityAll = allMid?.level ?? null;

  return {
    /** @deprecated use densityField — kept for older normalize logic */
    typical: densityField,
    densityField,
    densityAll,
    min,
    max,
    fieldWeight: fieldMid?.weight ?? 0,
    /** Flat Lv80 World Tree shared-pool weight (exclude from field density). */
    worldTreePoolWeight,
    /** @deprecated alias — was mislabeled as Wildlife Sanctuary */
    sanctuaryWeight: worldTreePoolWeight,
  };
}

function writeSummary(byPal, meta) {
  const levels = {};
  for (const [palId, entries] of byPal) {
    const summary = summarizePal(entries);
    if (summary) levels[palId] = summary;
  }

  const payload = {
    source: {
      project: "Awy64/palworld-atlas-data",
      pages: PAGES_BASE,
      steamBuildId: meta.steamBuildId,
      generatedAt: meta.generatedAt ?? null,
      buildPath: meta.buildPath,
      note:
        "densityField excludes flat Lv80 World Tree shared-pool slots (72 pals, 1/72); densityAll includes them. Normalize nudges dump mid toward densityField only.",
    },
    fetchedAt: new Date().toISOString(),
    palCount: Object.keys(levels).length,
    levels,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(
    `Wrote ${outPath} (${payload.palCount} pals, steam build ${meta.steamBuildId})`,
  );
}

function loadLocalMaps(byPal) {
  for (const region of ["palpagos", "tree"]) {
    const dest = join(mapsDir, `${region}-spawns.json`);
    if (!existsSync(dest)) continue;
    const doc = JSON.parse(readFileSync(dest, "utf8"));
    for (const s of doc.spawns || []) {
      if (!s?.palId || s.minLevel == null || s.maxLevel == null) continue;
      if (!byPal.has(s.palId)) byPal.set(s.palId, []);
      byPal.get(s.palId).push(s);
    }
  }
}

async function main() {
  mkdirSync(mapsDir, { recursive: true });
  const byPal = new Map();

  const offline = process.argv.includes("--local");
  if (offline) {
    loadLocalMaps(byPal);
    if (!byPal.size) {
      console.error("No local atlas maps in data/atlas/maps/");
      process.exit(1);
    }
    let steamBuildId = "local";
    let generatedAt = null;
    let buildPath = "local";
    const latestPath = join(atlasDir, "latest.json");
    if (existsSync(latestPath)) {
      const latest = JSON.parse(readFileSync(latestPath, "utf8"));
      steamBuildId = String(latest.steamBuildId ?? steamBuildId);
      generatedAt = latest.generatedAt ?? null;
      buildPath = latest.buildPath || `builds/${steamBuildId}`;
    }
    writeSummary(byPal, { steamBuildId, generatedAt, buildPath });
    return;
  }

  const latest = await fetchJson(`${PAGES_BASE}/latest.json`);
  writeFileSync(join(atlasDir, "latest.json"), JSON.stringify(latest, null, 2));
  const buildId = String(latest.steamBuildId);
  const buildPath = latest.buildPath || `builds/${buildId}`;
  const base = `${PAGES_BASE}/${buildPath}`;

  for (const region of ["palpagos", "tree"]) {
    const url = `${base}/maps/${region}/spawns.json`;
    process.stdout.write(`Fetching ${region} spawns… `);
    const doc = await fetchJson(url);
    const dest = join(mapsDir, `${region}-spawns.json`);
    writeFileSync(dest, JSON.stringify(doc));
    const spawns = doc.spawns || [];
    console.log(`${spawns.length} points`);
    for (const s of spawns) {
      if (!s?.palId || s.minLevel == null || s.maxLevel == null) continue;
      if (!byPal.has(s.palId)) byPal.set(s.palId, []);
      byPal.get(s.palId).push(s);
    }
  }

  writeSummary(byPal, {
    steamBuildId: buildId,
    generatedAt: latest.generatedAt ?? null,
    buildPath,
  });
}

main().catch((err) => {
  console.error(err);
  if (existsSync(outPath)) {
    const prev = JSON.parse(readFileSync(outPath, "utf8"));
    console.warn(
      `Keeping existing spawn-catch-levels.json (${prev.palCount ?? "?"} pals)`,
    );
    process.exit(0);
  }
  process.exit(1);
});
