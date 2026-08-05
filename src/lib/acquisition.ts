import type { AcquisitionKind, Pal } from "./types";

/**
 * Floor for pals with no wild level band (raid eggs, exclusives, etc.).
 * Must sit above any min-weighted wild score (wild max is ~80).
 */
const NO_WILD_ACQUISITION_FLOOR = 90;

/**
 * Wild-band catch level for feasibility ranking.
 * Prefers `typicalWildLevel` when present (dump min-weighted mid, conservatively
 * nudged by atlas spawn density at normalize time). Falls back to a
 * min-weighted midpoint of the dump band.
 */
export function wildCatchLevel(pal: Pal): number | null {
  if (typeof pal.typicalWildLevel === "number") {
    return pal.typicalWildLevel;
  }
  const min = pal.minWildLevel;
  const max = pal.maxWildLevel;
  if (min != null && max != null) {
    return Math.round(0.65 * min + 0.35 * max);
  }
  if (max != null) return max;
  if (min != null) return min;
  return null;
}

/**
 * Best single-number “how late to obtain?” level from wild spawns.
 * Field/sealed alpha levels are kept on the pal for reference but do not
 * drive this score (one fixed boss is a worse model of typical acquisition).
 */
export function palAcquisitionLevel(pal: Pal): number | null {
  return wildCatchLevel(pal);
}

export function hasWildSpawnBand(pal: Pal): boolean {
  return pal.minWildLevel != null || pal.maxWildLevel != null;
}

/** Dump rarity 20 = legendary tier (Frostallion, Jetragon, etc.). */
const LEGENDARY_RARITY = 20;
const LEGENDARY_ACQUISITION_BUMP = 5;

function worldTreeBump(pal: Pal): number {
  if (pal.isWorldTreeLocked || pal.isWorldTreeBreedable) return 25;
  if (pal.acquisitionKind === "worldTree") return 25;
  return 0;
}

/**
 * Extra friction for legendaries. Raid legendaries (Bellanoir, etc.) already
 * use curated override levels — do not double-count.
 */
function legendaryBump(pal: Pal): number {
  if (pal.rarity < LEGENDARY_RARITY) return 0;
  if (pal.acquisitionKind === "raid") return 0;
  return LEGENDARY_ACQUISITION_BUMP;
}

/**
 * Compute acquisition cost from pal fields (ignores any cached acquisitionCost).
 */
export function computeAcquisitionCost(pal: Pal): number {
  const bump = worldTreeBump(pal) + legendaryBump(pal);
  const level = palAcquisitionLevel(pal);
  if (level != null) {
    return level + bump;
  }
  return NO_WILD_ACQUISITION_FLOOR + pal.rarity + bump;
}

/**
 * Rough “how late in the game is this Pal to obtain?” score.
 * Uses precomputed `acquisitionCost` when present (set at dataset load).
 */
export function palAcquisitionCost(pal: Pal): number {
  if (typeof pal.acquisitionCost === "number") {
    return pal.acquisitionCost;
  }
  return computeAcquisitionCost(pal);
}

/** Attach cached acquisitionCost on every pal (mutates in place). */
export function attachAcquisitionCosts(pals: readonly Pal[]): void {
  for (const pal of pals) {
    pal.acquisitionCost = computeAcquisitionCost(pal);
  }
}

export type AcquisitionStats = {
  max: number;
  avg: number;
  sum: number;
  count: number;
  hardest: Pal | null;
};

export function acquisitionStats(pals: Pal[]): AcquisitionStats {
  if (pals.length === 0) {
    return { max: 0, avg: 0, sum: 0, count: 0, hardest: null };
  }

  let max = -1;
  let sum = 0;
  let hardest: Pal | null = null;
  for (const pal of pals) {
    const cost = palAcquisitionCost(pal);
    sum += cost;
    if (
      cost > max ||
      (cost === max && hardest != null && pal.index < hardest.index)
    ) {
      max = cost;
      hardest = pal;
    }
  }

  return {
    max,
    avg: sum / pals.length,
    sum,
    count: pals.length,
    hardest,
  };
}

export function compareAcquisitionStats(
  a: AcquisitionStats,
  b: AcquisitionStats,
): number {
  if (a.max !== b.max) return a.max - b.max;
  if (a.avg !== b.avg) return a.avg - b.avg;
  return 0;
}

/** Quiet one-liner for cards explaining hardest acquire among a set of pals. */
export function formatAcquisitionHint(
  stats: AcquisitionStats,
  feasibility?: {
    missingOwned: number;
    ownedPartners: number;
  } | null,
): string | null {
  if (feasibility && feasibility.ownedPartners + feasibility.missingOwned > 0) {
    const total = feasibility.ownedPartners + feasibility.missingOwned;
    if (feasibility.missingOwned === 0) {
      return `All ${total} partner${total === 1 ? "" : "s"} already owned`;
    }
    if (feasibility.ownedPartners > 0) {
      return `Uses ${feasibility.ownedPartners} owned · needs ${feasibility.missingOwned} more`;
    }
  }
  if (!stats.hardest || stats.count === 0) return null;
  const hardest = stats.hardest;
  // Show the same number ranking uses (includes legendary / WT bumps), not raw catch level.
  if (hasWildSpawnBand(hardest) || typeof hardest.typicalWildLevel === "number") {
    return `Hardest catch ~Lv ${palAcquisitionCost(hardest)} (${hardest.name})`;
  }
  if (!hasWildSpawnBand(hardest)) {
    return `Hardest acquire: ${hardest.name} (no wild spawn)`;
  }
  return `Hardest acquire: ${hardest.name} (${hardest.difficulty})`;
}

export function isWorldTreeAcquisitionKind(kind: AcquisitionKind): boolean {
  return kind === "worldTree";
}
