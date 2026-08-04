#!/usr/bin/env node
/**
 * Normalize palcalc source dumps into compact app JSON.
 * Source: tylercamp/palcalc v1.18.3 (after Palworld 1.0.2)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");
const outDir = join(root, "public", "data");

const SOURCE = {
  project: "tylercamp/palcalc",
  release: "v1.18.3",
  publishedAt: "2026-07-31T14:09:03Z",
  note: "Latest public game-file dump found after Palworld 1.0.2 (2026-07-29/30). DB Version comes from the dump itself.",
  urls: {
    release: "https://github.com/tylercamp/palcalc/releases/tag/v1.18.3",
    db: "https://raw.githubusercontent.com/tylercamp/palcalc/v1.18.3/PalCalc.Model/db.json",
    breeding:
      "https://raw.githubusercontent.com/tylercamp/palcalc/v1.18.3/PalCalc.Model/breeding.json",
  },
};

const TRENDING = [
  "Anubis",
  "Orserk",
  "Jormuntide",
  "Shadowbeak",
  "Faleris",
  "Lyleen",
  "Eidrolon",
  "Jetragon",
];

const UNREACHABLE = 10000;

/**
 * World Tree habitat-only (Palworld 1.0+). Excludes pals that also spawn
 * elsewhere (e.g. Majex at Sanctuary 2, Shaolong via Floating Islands raid).
 * Orserk/Bastigor are catch-locked there; the rest are classified by breeding
 * reachability from non–World Tree stock.
 */
const WORLD_TREE_HABITAT = new Set([
  "Orserk",
  "Bastigor",
  "Wispaw",
  "Univolt Cryst",
  "Elgrove Cryst",
  "Petallia Ignis",
  "Beakon Cryst",
  "Rayhound Cryst",
  "Moldron Cryst",
  "Sibelyx Primo",
  "Starryon Primo",
  "Dualith Noct",
  "Tetroise Primo",
  "Celesdir Noct",
  "Snock Lux",
  "Eidrolon Ignis",
  "Flaracle",
  "Dupin",
  "Roujay",
  "Venusa",
  "Mycora",
  "Loomen",
  "Wistella",
  "Solenne",
  "Renjishi",
  "Aegidron",
  "Silvance",
  "Dandilord",
]);

/**
 * Dump omits or mis-bands Min/MaxWildLevel for fishing-only, raid-egg,
 * meteor/event, chest-mimic, and some WT pals. Synthetic levels for
 * acquisition scoring (community sources).
 *
 * Fishing / meteor / raid: typical first-acquire level + 10 for RNG / clear lag.
 */
const WILD_LEVEL_OVERRIDES = {
  // Wild on Frostbitten Isle; dump band missing
  Icelyn: { min: 39, max: 48 },
  // Fishing — earliest spot + 10
  "Finsider Ignis": { min: 40, max: 40 }, // Phantom Isle 30–40
  "Penking Lux": { min: 40, max: 40 }, // Phantom Isle 30–40
  "Ghangler Ignis": { min: 51, max: 51 }, // Sanctuary 2 41–45
  // Meteor / space pals — typical encounter + 10 event RNG
  Xenovader: { min: 40, max: 40 }, // scales with zone; ~30 typical early + 10
  Xenogard: { min: 65, max: 65 }, // high-level meteors ~55 + 10
  Selyne: { min: 65, max: 65 }, // Sakurajima meteor / tower ~55 + 10 (dump is WT 76–80)
  // Chest mimic — wide dump band 5–80; treat as mid + flee RNG
  Mimog: { min: 40, max: 40 },
  // Summoning raid / story gate — boss fight level + 10
  Bellanoir: { min: 40, max: 40 }, // raid Lv 30
  "Bellanoir Libero": { min: 60, max: 60 }, // raid Lv 50
  "Blazamut Ryu": { min: 65, max: 65 }, // raid Lv 55
  Xenolord: { min: 70, max: 70 }, // raid Lv 60
  Hartalis: { min: 75, max: 75 }, // raid Lv 65
  Panthalus: { min: 80, max: 80 }, // story Lv 70
  // World Tree bosses (also WT-locked)
  Silvance: { min: 78, max: 78 },
  Dandilord: { min: 78, max: 78 },
};

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function dexLabel(id) {
  const n = String(id.PalDexNo).padStart(3, "0");
  return id.IsVariant ? `${n}B` : n;
}

function difficultyTier(rarity) {
  if (rarity <= 3) return "early";
  if (rarity <= 6) return "mid";
  if (rarity <= 9) return "late";
  return "endgame";
}

function isTerraria(internalName) {
  return String(internalName).startsWith("Yakushima");
}

function workEntries(suitability) {
  if (!suitability || typeof suitability !== "object") return [];
  return Object.entries(suitability)
    .filter(([, level]) => Number(level) > 0)
    .map(([work, level]) => ({ work, level: Number(level) }))
    .sort((a, b) => b.level - a.level || a.work.localeCompare(b.work));
}

function main() {
  const dbPath = join(dataDir, "db.source.json");
  const breedingPath = join(dataDir, "breeding.source.json");

  if (!existsSync(dbPath) || !existsSync(breedingPath)) {
    if (existsSync(join(outDir, "pals.json"))) {
      console.log("No source dumps; using existing public/data");
      return;
    }
    console.error("Missing source dumps in data/");
    process.exit(1);
  }

  const dbRaw = readFileSync(dbPath);
  const breedingRaw = readFileSync(breedingPath);
  const db = JSON.parse(dbRaw.toString("utf8"));
  const breeding = JSON.parse(breedingRaw.toString("utf8"));

  const pals = db.Pals.map((p, index) => ({
    index,
    internalName: p.InternalName,
    name: p.Name,
    dexNo: p.Id.PalDexNo,
    isVariant: Boolean(p.Id.IsVariant),
    dex: dexLabel(p.Id),
    breedingPower: p.BreedingPower,
    rarity: p.Rarity ?? 0,
    difficulty: difficultyTier(p.Rarity ?? 0),
    minWildLevel: p.MinWildLevel ?? null,
    maxWildLevel: p.MaxWildLevel ?? null,
    minAlphaLevel: null,
    price: p.Price ?? null,
    nocturnal: Boolean(p.Nocturnal),
    isTerraria: isTerraria(p.InternalName),
    isWorldTreeLocked: false,
    isWorldTreeBreedable: false,
    work: workEntries(p.WorkSuitability),
  }));

  let wildOverrideCount = 0;
  for (const pal of pals) {
    const override = WILD_LEVEL_OVERRIDES[pal.name];
    if (!override) continue;
    pal.minWildLevel = override.min;
    pal.maxWildLevel = override.max;
    wildOverrideCount += 1;
  }

  // Field (non-tower) alpha levels from data/field-alphas.json (palworld.tools scrape).
  const fieldAlphasPath = join(dataDir, "field-alphas.json");
  let fieldAlphaMissing = [];
  if (existsSync(fieldAlphasPath)) {
    const fieldAlphas = JSON.parse(
      readFileSync(fieldAlphasPath).toString("utf8"),
    );
    const byName = new Map(pals.map((p) => [p.name.toLowerCase(), p]));
    const bySlug = new Map(
      pals.map((p) => [
        p.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        p,
      ]),
    );
    for (const alpha of fieldAlphas.alphas ?? []) {
      const pal =
        byName.get(String(alpha.name).toLowerCase()) ||
        bySlug.get(String(alpha.slug).toLowerCase());
      if (!pal) {
        fieldAlphaMissing.push(alpha.name ?? alpha.slug);
        continue;
      }
      const level = Number(alpha.minLevel);
      if (!Number.isFinite(level)) continue;
      if (pal.minAlphaLevel == null || level < pal.minAlphaLevel) {
        pal.minAlphaLevel = level;
      }
    }
  }

  const byInternal = new Map(pals.map((p) => [p.internalName, p.index]));
  const missing = new Set();
  const combos = [];
  const specialGenders = [];
  const byParent = Array.from({ length: pals.length }, () => []);

  for (const row of breeding.Breeding) {
    const a = byInternal.get(row.Parent1InternalName);
    const b = byInternal.get(row.Parent2InternalName);
    const c = byInternal.get(row.ChildInternalName);
    if (a == null || b == null || c == null) {
      missing.add(
        `${row.Parent1InternalName}+${row.Parent2InternalName}->${row.ChildInternalName}`,
      );
      continue;
    }

    const g1 = row.Parent1Gender ?? "WILDCARD";
    const g2 = row.Parent2Gender ?? "WILDCARD";
    const comboIndex = combos.length;
    combos.push([a, b, c]);
    byParent[a].push(comboIndex);
    if (a !== b) byParent[b].push(comboIndex);

    if (g1 !== "WILDCARD" || g2 !== "WILDCARD") {
      specialGenders.push({
        parentA: a,
        parentB: b,
        child: c,
        parentAGender: g1,
        parentBGender: g2,
      });
    }
  }

  const byChild = Array.from({ length: pals.length }, () => []);
  for (let i = 0; i < combos.length; i++) {
    byChild[combos[i][2]].push(i);
  }

  // Classify World Tree habitat pals: breedable from outside stock vs catch-locked.
  const wtIndices = new Set(
    pals.filter((p) => WORLD_TREE_HABITAT.has(p.name)).map((p) => p.index),
  );
  const reachable = new Set();
  for (const p of pals) {
    if (p.isTerraria || wtIndices.has(p.index)) continue;
    reachable.add(p.index);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const [a, b, c] of combos) {
      if (reachable.has(c)) continue;
      if (pals[a].isTerraria || pals[b].isTerraria || pals[c].isTerraria) {
        continue;
      }
      if (reachable.has(a) && reachable.has(b)) {
        reachable.add(c);
        grew = true;
      }
    }
  }
  for (const index of wtIndices) {
    if (reachable.has(index)) pals[index].isWorldTreeBreedable = true;
    else pals[index].isWorldTreeLocked = true;
  }

  // Compact min-steps matrix: only finite reachable edges as [from, to, steps]
  const minSteps = [];
  const stepMatrix = breeding.MinBreedingSteps ?? {};
  for (const pal of pals) {
    const row = stepMatrix[pal.internalName];
    if (!row) continue;
    for (const [toName, steps] of Object.entries(row)) {
      const to = byInternal.get(toName);
      if (to == null) continue;
      const n = Number(steps);
      if (!Number.isFinite(n) || n >= UNREACHABLE) continue;
      if (n === 0 && pal.index === to) continue;
      minSteps.push([pal.index, to, n]);
    }
  }

  const mutationPassives = (db.PassiveSkills ?? [])
    .filter((p) => String(p.InternalName).startsWith("MutationPal_"))
    .map((p) => ({
      internalName: p.InternalName,
      name: p.Name,
      description: p.Description ?? "",
      rank: p.Rank ?? null,
    }));

  const trending = TRENDING.map(
    (name) => pals.find((p) => p.name === name)?.index,
  ).filter((i) => i != null);

  const meta = {
    ...SOURCE,
    dbVersion: db.Version,
    palCount: pals.length,
    comboCount: combos.length,
    specialGenderComboCount: specialGenders.length,
    missingComboCount: missing.size,
    terrariaCount: pals.filter((p) => p.isTerraria).length,
    worldTreeLockedCount: pals.filter((p) => p.isWorldTreeLocked).length,
    worldTreeBreedableCount: pals.filter((p) => p.isWorldTreeBreedable).length,
    fieldAlphaSpeciesCount: pals.filter((p) => p.minAlphaLevel != null).length,
    wildLevelOverrideCount: wildOverrideCount,
    minStepEdgeCount: minSteps.length,
    mutationPassiveCount: mutationPassives.length,
    trending,
    hashes: {
      dbSourceSha256: sha256(dbRaw),
      breedingSourceSha256: sha256(breedingRaw),
    },
    generatedAt: new Date().toISOString(),
    gameTarget: {
      minimum: "Palworld 1.0",
      preferred: "Palworld 1.0.2",
      alignmentNote:
        "palcalc v1.18.3 shipped 2026-07-31, one day after Steam 1.0.2 hotfixes. No separate public 1.0.2-only dump was found; this is the newest dump available.",
    },
    features: {
      worldTreeNote:
        "World Tree exclusives require catching inside the World Tree (self-breed only). World Tree breedables wild-spawn there but can be bred from non–World Tree parents.",
    },
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
  writeFileSync(join(outDir, "pals.json"), JSON.stringify(pals));
  writeFileSync(join(outDir, "combos.json"), JSON.stringify(combos));
  writeFileSync(join(outDir, "by-child.json"), JSON.stringify(byChild));
  writeFileSync(join(outDir, "by-parent.json"), JSON.stringify(byParent));
  writeFileSync(join(outDir, "min-steps.json"), JSON.stringify(minSteps));
  writeFileSync(
    join(outDir, "special-genders.json"),
    JSON.stringify(specialGenders),
  );
  writeFileSync(
    join(outDir, "mutation-passives.json"),
    JSON.stringify(mutationPassives),
  );
  writeFileSync(join(dataDir, "manifest.json"), JSON.stringify(meta, null, 2));

  console.log(
    `Normalized ${pals.length} pals, ${combos.length} combos, ${minSteps.length} step edges (db ${db.Version}); WT locked ${meta.worldTreeLockedCount}, WT breedable ${meta.worldTreeBreedableCount}; field alphas ${meta.fieldAlphaSpeciesCount}; wild overrides ${wildOverrideCount}`,
  );
  if (fieldAlphaMissing.length) {
    console.warn(
      `Unmatched field alphas (${fieldAlphaMissing.length}): ${fieldAlphaMissing.join(", ")}`,
    );
  }
  if (missing.size) console.warn(`Skipped ${missing.size} unknown combos`);
}

main();
