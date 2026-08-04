import {
  acquisitionStats,
  attachAcquisitionCosts,
  compareAcquisitionStats,
  hasWildSpawnBand,
} from "./acquisition";
import type {
  BreedingDataset,
  Combo,
  DatasetMeta,
  MinStepEdge,
  MutationPassive,
  Pal,
  SpecialGenderCombo,
} from "./types";

const UNREACHABLE = 10_000;

function pairKey(a: number, b: number): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

export type DatasetParts = {
  meta: DatasetMeta;
  pals: Pal[];
  combos: Combo[];
  byChild: number[][];
  byParent: number[][];
  specialGenders: SpecialGenderCombo[];
  mutationPassives: MutationPassive[];
  minStepEdges: MinStepEdge[];
};

/** Assemble indexes / matrices from normalized JSON parts (browser or Node). */
export function assembleDataset(parts: DatasetParts): BreedingDataset {
  const {
    meta,
    pals,
    combos,
    byChild,
    byParent,
    specialGenders,
    mutationPassives,
    minStepEdges,
  } = parts;

  const byInternalName = new Map(pals.map((p) => [p.internalName, p]));
  const byName = new Map(pals.map((p) => [p.name.toLowerCase(), p]));
  const pairToChild = new Map<string, number>();
  for (const [a, b, child] of combos) {
    pairToChild.set(pairKey(a, b), child);
  }

  const minSteps = Array.from({ length: pals.length }, () =>
    Array.from({ length: pals.length }, () => UNREACHABLE),
  );
  for (let i = 0; i < pals.length; i++) minSteps[i][i] = 0;
  for (const [from, to, steps] of minStepEdges) {
    minSteps[from][to] = steps;
  }

  for (const pal of pals) {
    if (!pal.acquisitionKind) {
      pal.acquisitionKind =
        pal.isWorldTreeLocked || pal.isWorldTreeBreedable
          ? "worldTree"
          : "wild";
    }
  }
  attachAcquisitionCosts(pals);

  return {
    meta,
    pals,
    combos,
    byChild,
    byParent,
    specialGenders,
    mutationPassives,
    minSteps,
    byInternalName,
    byName,
    pairToChild,
  };
}

export async function loadDataset(): Promise<BreedingDataset> {
  const [
    meta,
    pals,
    combos,
    byChild,
    byParent,
    specialGenders,
    mutationPassives,
    minStepEdges,
  ] = await Promise.all([
    fetch("/data/meta.json").then((r) => r.json() as Promise<DatasetMeta>),
    fetch("/data/pals.json").then((r) => r.json() as Promise<Pal[]>),
    fetch("/data/combos.json").then((r) => r.json() as Promise<Combo[]>),
    fetch("/data/by-child.json").then((r) => r.json() as Promise<number[][]>),
    fetch("/data/by-parent.json").then((r) => r.json() as Promise<number[][]>),
    fetch("/data/special-genders.json").then(
      (r) => r.json() as Promise<SpecialGenderCombo[]>,
    ),
    fetch("/data/mutation-passives.json").then(
      (r) => r.json() as Promise<MutationPassive[]>,
    ),
    fetch("/data/min-steps.json").then(
      (r) => r.json() as Promise<MinStepEdge[]>,
    ),
  ]);

  return assembleDataset({
    meta,
    pals,
    combos,
    byChild,
    byParent,
    specialGenders,
    mutationPassives,
    minStepEdges,
  });
}

export function findChild(
  dataset: BreedingDataset,
  parentA: number,
  parentB: number,
): Pal | null {
  const childIndex = dataset.pairToChild.get(pairKey(parentA, parentB));
  if (childIndex == null) return null;
  return dataset.pals[childIndex] ?? null;
}

export interface PalFilterOptions {
  hideTerraria?: boolean;
  hideWorldTreeLocked?: boolean;
  hideWorldTreeBreedable?: boolean;
}

/** True when this Pal should be excluded by the active hide filters. */
export function isPalFiltered(
  pal: Pal | undefined | null,
  options: PalFilterOptions,
): boolean {
  if (!pal) return true;
  if (options.hideTerraria && pal.isTerraria) return true;
  if (options.hideWorldTreeLocked && pal.isWorldTreeLocked) return true;
  if (options.hideWorldTreeBreedable && pal.isWorldTreeBreedable) return true;
  return false;
}

export interface ParentPair {
  comboIndex: number;
  parentA: Pal;
  parentB: Pal;
  child: Pal;
  maxParentRarity: number;
  sumRarity: number;
  sameSpecies: boolean;
  genderNote?: string;
}

export function findParents(
  dataset: BreedingDataset,
  childIndex: number,
  options: PalFilterOptions & { owned?: Set<number> } = {},
): ParentPair[] {
  const indexes = dataset.byChild[childIndex] ?? [];
  const results: ParentPair[] = [];
  const genderNotes = genderNoteMap(dataset);

  for (const comboIndex of indexes) {
    const [a, b, c] = dataset.combos[comboIndex];
    const parentA = dataset.pals[a];
    const parentB = dataset.pals[b];
    if (!parentA || !parentB) continue;
    if (
      isPalFiltered(parentA, options) ||
      isPalFiltered(parentB, options)
    ) {
      continue;
    }

    const maxParentRarity = Math.max(parentA.rarity, parentB.rarity);

    results.push({
      comboIndex,
      parentA,
      parentB,
      child: dataset.pals[c],
      maxParentRarity,
      sumRarity: parentA.rarity + parentB.rarity,
      sameSpecies: a === b,
      genderNote: genderNotes.get(comboIndex),
    });
  }

  results.sort((x, y) => {
    const xo = ownedScore(x, options.owned);
    const yo = ownedScore(y, options.owned);
    if (xo !== yo) return xo - yo;

    // Prefer pairs whose harder parent is earlier-game (same idea as path partners).
    const xWt =
      (isWtHabitatParent(x.parentA) ? 1 : 0) +
      (isWtHabitatParent(x.parentB) ? 1 : 0);
    const yWt =
      (isWtHabitatParent(y.parentA) ? 1 : 0) +
      (isWtHabitatParent(y.parentB) ? 1 : 0);
    if (xWt !== yWt) return xWt - yWt;

    const xWild =
      (hasWildSpawnBand(x.parentA) ? 0 : 1) +
      (hasWildSpawnBand(x.parentB) ? 0 : 1);
    const yWild =
      (hasWildSpawnBand(y.parentA) ? 0 : 1) +
      (hasWildSpawnBand(y.parentB) ? 0 : 1);
    if (xWild !== yWild) return xWild - yWild;

    const acq = compareAcquisitionStats(
      acquisitionStats([x.parentA, x.parentB]),
      acquisitionStats([y.parentA, y.parentB]),
    );
    if (acq !== 0) return acq;

    if (x.sumRarity !== y.sumRarity) return x.sumRarity - y.sumRarity;
    if (x.maxParentRarity !== y.maxParentRarity) {
      return x.maxParentRarity - y.maxParentRarity;
    }
    const an = x.parentA.name.localeCompare(y.parentA.name);
    if (an !== 0) return an;
    return x.parentB.name.localeCompare(y.parentB.name);
  });

  return results;
}

function ownedScore(pair: ParentPair, owned?: Set<number>): number {
  if (!owned || owned.size === 0) return 1;
  const a = owned.has(pair.parentA.index);
  const b = owned.has(pair.parentB.index);
  if (a && b) return 0;
  if (a || b) return 1;
  return 2;
}

function isWtHabitatParent(pal: Pal): boolean {
  return (
    pal.isWorldTreeLocked ||
    pal.isWorldTreeBreedable ||
    pal.acquisitionKind === "worldTree"
  );
}

function genderNoteMap(dataset: BreedingDataset): Map<number, string> {
  const map = new Map<string, string>();
  for (const row of dataset.specialGenders) {
    const key = pairKey(row.parentA, row.parentB);
    const a = dataset.pals[row.parentA].name;
    const b = dataset.pals[row.parentB].name;
    const child = dataset.pals[row.child].name;
    map.set(
      `${key}|${row.child}`,
      `${a} (${row.parentAGender.toLowerCase()}) + ${b} (${row.parentBGender.toLowerCase()}) → ${child}`,
    );
  }

  const byCombo = new Map<number, string>();
  for (let i = 0; i < dataset.combos.length; i++) {
    const [a, b, c] = dataset.combos[i];
    const note = map.get(`${pairKey(a, b)}|${c}`);
    if (note) byCombo.set(i, note);
  }
  return byCombo;
}

export function rarityToRank(rarity: number): number {
  if (rarity <= 3) return 0;
  if (rarity <= 6) return 1;
  if (rarity <= 9) return 2;
  return 3;
}

export function searchPals(pals: Pal[], query: string): Pal[] {
  const q = query.trim().toLowerCase();
  if (!q) return pals.slice().sort(comparePals);

  return pals
    .filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.dex.toLowerCase().includes(q) ||
        String(p.dexNo).includes(q)
      );
    })
    .sort((a, b) => {
      const as = scoreMatch(a, q);
      const bs = scoreMatch(b, q);
      if (as !== bs) return as - bs;
      return comparePals(a, b);
    });
}

export function filterPals(
  pals: Pal[],
  options: PalFilterOptions & { query?: string },
): Pal[] {
  let list = pals.filter((p) => !isPalFiltered(p, options));
  if (options.query) return searchPals(list, options.query);
  return list.slice().sort(comparePals);
}

export function childrenFromParent(
  dataset: BreedingDataset,
  parentIndex: number,
  options: PalFilterOptions = {},
): { child: Pal; partners: Pal[] }[] {
  const map = new Map<number, Pal[]>();
  for (const comboIndex of dataset.byParent[parentIndex] ?? []) {
    const [a, b, c] = dataset.combos[comboIndex];
    const partnerIndex = a === parentIndex ? b : a;
    const partner = dataset.pals[partnerIndex];
    const child = dataset.pals[c];
    if (!partner || !child) continue;
    if (isPalFiltered(partner, options) || isPalFiltered(child, options)) {
      continue;
    }
    const list = map.get(c) ?? [];
    list.push(partner);
    map.set(c, list);
  }

  return [...map.entries()]
    .map(([childIndex, partners]) => ({
      child: dataset.pals[childIndex],
      partners: partners.sort(comparePals),
    }))
    .sort((a, b) => comparePals(a.child, b.child));
}

function scoreMatch(pal: Pal, q: string): number {
  const name = pal.name.toLowerCase();
  if (name === q || pal.dex.toLowerCase() === q) return 0;
  if (name.startsWith(q) || pal.dex.toLowerCase().startsWith(q)) return 1;
  return 2;
}

export function comparePals(a: Pal, b: Pal): number {
  if (a.dexNo !== b.dexNo) return a.dexNo - b.dexNo;
  if (a.isVariant !== b.isVariant) return a.isVariant ? 1 : -1;
  return a.name.localeCompare(b.name);
}

export function formatWork(work: string): string {
  return work.replace(/([a-z])([A-Z])/g, "$1 $2");
}
