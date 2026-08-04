import type { Pal } from "./types";

/**
 * Floor for pals with no wild level band (raid eggs, exclusives, etc.).
 * Must sit above any min-weighted wild score (wild max is ~80).
 */
const NO_WILD_ACQUISITION_FLOOR = 90;

/**
 * Wild-band catch level for feasibility ranking.
 * Min-weighted midpoint: players usually meet a species while exploring
 * near the early end of its spawn band, not only at max or via a lone alpha.
 */
export function wildCatchLevel(pal: Pal): number | null {
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

/**
 * Rough “how late in the game is this Pal to obtain?” score.
 * Prefer wild catch level when known. No wild band → raid/exclusive floor.
 *
 * World Tree habitat bump applies to locked *and* breedable species when
 * scored as partners / parents to acquire (not as breed results).
 */
export function palAcquisitionCost(pal: Pal): number {
  const worldTreeBump =
    pal.isWorldTreeLocked || pal.isWorldTreeBreedable ? 25 : 0;
  const level = palAcquisitionLevel(pal);
  if (level != null) {
    return level + worldTreeBump;
  }
  return NO_WILD_ACQUISITION_FLOOR + pal.rarity + worldTreeBump;
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
  const level = palAcquisitionLevel(hardest);
  if (level != null) {
    return `Hardest catch ~Lv ${level} (${hardest.name})`;
  }
  if (!hasWildSpawnBand(hardest)) {
    return `Hardest acquire: ${hardest.name} (no wild spawn)`;
  }
  return `Hardest acquire: ${hardest.name} (${hardest.difficulty})`;
}
