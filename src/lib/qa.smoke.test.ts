/**
 * Real-data QA smoke for acquisition ranking + merge/parents ordering.
 * Run: npx vitest run src/lib/qa.smoke.test.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  attachAcquisitionCosts,
  palAcquisitionCost,
} from "./acquisition";
import { assembleDataset, findParents } from "./breeding";
import {
  buildMergeTree,
  filterMergeCandidatesByPairingSearch,
  findChainCandidates,
  findMergeCandidates,
  findShortestPath,
  pathPartnerAcquisitionStats,
  sortPathResultsByFeasibility,
  type PathOptions,
  type PathResult,
} from "./path";
import type {
  Combo,
  DatasetMeta,
  MinStepEdge,
  MutationPassive,
  Pal,
  SpecialGenderCombo,
} from "./types";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(root, rel), "utf8")) as T;
}

function loadDataset() {
  const dataset = assembleDataset({
    meta: loadJson<DatasetMeta>("public/data/meta.json"),
    pals: loadJson<Pal[]>("public/data/pals.json"),
    combos: loadJson<Combo[]>("public/data/combos.json"),
    byChild: loadJson<number[][]>("public/data/by-child.json"),
    byParent: loadJson<number[][]>("public/data/by-parent.json"),
    specialGenders: loadJson<SpecialGenderCombo[]>(
      "public/data/special-genders.json",
    ),
    mutationPassives: loadJson<MutationPassive[]>(
      "public/data/mutation-passives.json",
    ),
    minStepEdges: loadJson<MinStepEdge[]>("public/data/min-steps.json"),
  });
  // assembleDataset already attaches costs; assert it happened
  expect(dataset.pals[0].acquisitionCost).toBeTypeOf("number");
  return dataset;
}

function byName(dataset: ReturnType<typeof loadDataset>, name: string): Pal {
  const pal = dataset.byName.get(name.toLowerCase());
  if (!pal) throw new Error(`Missing pal ${name}`);
  return pal;
}

function treeInvolvesPal(tree: PathResult, index: number): boolean {
  return tree.steps.some(
    (step) =>
      step.from.index === index ||
      step.partner.index === index ||
      step.child.index === index,
  );
}

describe("QA smoke — real pals.json", () => {
  const dataset = loadDataset();

  it("curated acquisition kinds and costs match contracts", () => {
    const xenolord = byName(dataset, "Xenolord");
    const blazamut = byName(dataset, "Blazamut");
    const selyne = byName(dataset, "Selyne");
    const mimog = byName(dataset, "Mimog");
    const flaracle = byName(dataset, "Flaracle");
    const frostplume = byName(dataset, "Frostplume");

    expect(xenolord.acquisitionKind).toBe("raid");
    expect(selyne.acquisitionKind).toBe("meteor");
    expect(mimog.acquisitionKind).toBe("chest");
    expect(flaracle.acquisitionKind).toBe("worldTree");
    expect(flaracle.isWorldTreeBreedable).toBe(true);

    expect(palAcquisitionCost(xenolord)).toBe(70);
    expect(palAcquisitionCost(blazamut)).toBe(48);
    expect(palAcquisitionCost(selyne)).toBe(65);
    expect(palAcquisitionCost(mimog)).toBe(40);
    expect(palAcquisitionCost(frostplume)).toBe(57);
    expect(frostplume.typicalWildLevel).toBe(57);
    const grizzbolt = byName(dataset, "Grizzbolt");
    expect(palAcquisitionCost(grizzbolt)).toBe(56);
    expect(palAcquisitionCost(frostplume)).toBeGreaterThan(
      palAcquisitionCost(blazamut),
    );
    expect(palAcquisitionCost(grizzbolt)).toBeGreaterThan(
      palAcquisitionCost(blazamut),
    );
    expect(palAcquisitionCost(grizzbolt)).toBeLessThan(70);
    const astegon = byName(dataset, "Astegon");
    // Volcano Sanctuary guardian is Lv55 field/alpha — not the shared WT Lv80 pool
    expect(palAcquisitionCost(astegon)).toBe(55);
    expect(palAcquisitionCost(astegon)).toBeLessThan(
      palAcquisitionCost(grizzbolt) + 5,
    );
    const shadowbeak = byName(dataset, "Shadowbeak");
    // No.3 resident / rare roam, not a sanctuary guardian boss
    expect(palAcquisitionCost(shadowbeak)).toBe(53);
    expect(palAcquisitionCost(shadowbeak)).toBeLessThan(65);
    expect(palAcquisitionCost(flaracle)).toBeGreaterThan(
      palAcquisitionCost(blazamut),
    );
    expect(palAcquisitionCost(xenolord)).toBeGreaterThan(
      palAcquisitionCost(blazamut),
    );

    const frostallion = byName(dataset, "Frostallion");
    const jetragon = byName(dataset, "Jetragon");
    const bellanoir = byName(dataset, "Bellanoir");
    expect(frostallion.rarity).toBe(20);
    expect(palAcquisitionCost(frostallion)).toBe(65); // typ 60 + legendary 5
    expect(palAcquisitionCost(jetragon)).toBe(75); // typ 70 + 5
    expect(bellanoir.acquisitionKind).toBe("raid");
    expect(palAcquisitionCost(bellanoir)).toBe(40); // raid override, no +5
  });

  it("Find the Parents for Anubis prefers earlier pairs over raid eggs", () => {
    const anubis = byName(dataset, "Anubis");
    const xenolord = byName(dataset, "Xenolord");
    const pairs = findParents(dataset, anubis.index, {});
    expect(pairs.length).toBeGreaterThan(10);

    const top = pairs.slice(0, 15);
    // Raid egg should not dominate the head of the list
    expect(
      top.some(
        (p) =>
          p.parentA.name === "Xenolord" || p.parentB.name === "Xenolord",
      ),
    ).toBe(false);

    const xenolordPair = pairs.find(
      (p) =>
        p.parentA.name === "Xenolord" || p.parentB.name === "Xenolord",
    );
    expect(xenolordPair).toBeTruthy();
    const xenIdx = pairs.indexOf(xenolordPair!);
    expect(xenIdx).toBeGreaterThan(20);

    const topMax = Math.max(
      ...top.map((p) =>
        Math.max(
          palAcquisitionCost(p.parentA),
          palAcquisitionCost(p.parentB),
        ),
      ),
    );
    expect(topMax).toBeLessThan(palAcquisitionCost(xenolord));
  });

  it("merge include filter requires the tagged Pal on the reconstructed tree", () => {
    const lamball = byName(dataset, "Lamball");
    const cattiva = byName(dataset, "Cattiva");
    const anubis = byName(dataset, "Anubis");
    const frostplume = byName(dataset, "Frostplume");
    const options: PathOptions = {
      pathResultCache: new Map(),
      partnerPoolCache: new Map(),
    };

    const all = findMergeCandidates(
      dataset,
      cattiva.index,
      lamball.index,
      anubis.index,
      options,
    );
    const filtered = filterMergeCandidatesByPairingSearch(
      dataset,
      cattiva.index,
      lamball.index,
      anubis.index,
      all,
      [frostplume.index],
      [],
      options,
    );

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(all.length * 0.5);

    const sample = filtered.slice(0, 25).map((c) =>
      buildMergeTree(
        dataset,
        cattiva.index,
        lamball.index,
        anubis.index,
        c,
        options,
      ),
    );
    for (const tree of sample) {
      expect(tree.unreachable).toBe(false);
      expect(treeInvolvesPal(tree, frostplume.index)).toBe(true);
    }
  });

  it("merge Lamball × Cattiva → Anubis: top trees avoid raid partners", () => {
    const lamball = byName(dataset, "Lamball");
    const cattiva = byName(dataset, "Cattiva");
    const anubis = byName(dataset, "Anubis");
    const options: PathOptions = {
      pathResultCache: new Map(),
      partnerPoolCache: new Map(),
    };

    const candidates = findMergeCandidates(
      dataset,
      lamball.index,
      cattiva.index,
      anubis.index,
      options,
    );
    expect(candidates.length).toBeGreaterThan(20);

    const pool = candidates.slice(0, 100).map((c) =>
      buildMergeTree(
        dataset,
        lamball.index,
        cattiva.index,
        anubis.index,
        c,
        options,
      ),
    );
    const ranked = sortPathResultsByFeasibility(pool, null).filter(
      (p) => !p.unreachable,
    );
    expect(ranked.length).toBeGreaterThan(5);

    const top5 = ranked.slice(0, 5);
    for (const tree of top5) {
      const partners = tree.steps.map((s) => s.partner.name);
      // Hard endgame raids should stay out of the head of the list.
      // Bellanoir Libero (override 60) can compete with bumped wild legendaries;
      // we leave raid overrides untouched.
      expect(partners).not.toContain("Xenolord");
      expect(partners).not.toContain("Bellanoir");
      expect(partners).not.toContain("Hartalis");
      expect(partners).not.toContain("Panthalus");
    }

    // Hardest partner on tree 1 should be mid/late wild, not endgame raid
    const hardest = pathPartnerAcquisitionStats(top5[0]).hardest;
    expect(hardest).toBeTruthy();
    expect(palAcquisitionCost(hardest!)).toBeLessThan(70);
  });

  it("route-through Lamball → Anubis ranks by feasibility with cache", () => {
    const lamball = byName(dataset, "Lamball");
    const anubis = byName(dataset, "Anubis");
    const options: PathOptions = {
      pathResultCache: new Map(),
      partnerPoolCache: new Map(),
    };

    const routes = findChainCandidates(
      dataset,
      lamball.index,
      [],
      anubis.index,
      options,
    );
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0].unreachable).toBe(false);
    expect(routes[0].totalBreeds).toBeLessThanOrEqual(routes[1]?.totalBreeds ?? 999);

    // Cache should have been populated if any shared segments were solved via findShortestPath
    // (chain enum uses DFS; still OK if empty). Rebuild one shortest for cache check.
    const a = findShortestPath(dataset, lamball.index, anubis.index, options, "finish");
    const b = findShortestPath(dataset, lamball.index, anubis.index, options, "finish");
    expect(b).toBe(a);
    expect(a.unreachable).toBe(false);
  });

  it("attachAcquisitionCosts is idempotent on loaded pals", () => {
    const before = dataset.pals.map((p) => p.acquisitionCost);
    attachAcquisitionCosts(dataset.pals);
    const after = dataset.pals.map((p) => p.acquisitionCost);
    expect(after).toEqual(before);
  });
});
