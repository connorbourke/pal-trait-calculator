import { comparePals, findChild } from "./breeding";
import type { BreedingDataset, Pal } from "./types";

const UNREACHABLE = 10_000;

export interface PathStep {
  from: Pal;
  partner: Pal;
  child: Pal;
  /** Why this step exists in the plan */
  role?: "chain" | "branch-a" | "branch-b" | "merge" | "finish";
}

export interface PathResult {
  steps: PathStep[];
  totalBreeds: number;
  unreachable: boolean;
  kind: "chain" | "merge";
  summary?: string;
  /** For merge plans: the two branch tips that breed together */
  merge?: {
    left: Pal;
    right: Pal;
    child: Pal;
  };
}

export type PathOptions = {
  hideTerraria?: boolean;
  includeTargetAsParent?: boolean;
};

/**
 * Reconstruct a shortest breeding chain from `start` toward `target`
 * using palcalc MinBreedingSteps distances + live combo lookups.
 */
export function findShortestPath(
  dataset: BreedingDataset,
  startIndex: number,
  targetIndex: number,
  options: PathOptions = {},
  role: PathStep["role"] = "chain",
): PathResult {
  if (startIndex === targetIndex) {
    return {
      steps: [],
      totalBreeds: 0,
      unreachable: false,
      kind: "chain",
    };
  }

  const distance = dataset.minSteps[startIndex]?.[targetIndex] ?? UNREACHABLE;
  if (distance >= UNREACHABLE) {
    return {
      steps: [],
      totalBreeds: distance,
      unreachable: true,
      kind: "chain",
    };
  }

  const partners = partnerPool(dataset, targetIndex, options);
  const steps: PathStep[] = [];
  let current = startIndex;

  for (let guard = 0; guard < distance + 5 && current !== targetIndex; guard++) {
    const remaining = dataset.minSteps[current][targetIndex];
    let best: PathStep | null = null;
    let bestPartnerRarity = Infinity;

    for (const partner of partners) {
      const child = findChild(dataset, current, partner.index);
      if (!child) continue;
      if (options.hideTerraria && child.isTerraria) continue;

      const nextRemaining = dataset.minSteps[child.index][targetIndex];
      if (!(nextRemaining < remaining)) continue;

      const better =
        !best ||
        nextRemaining < dataset.minSteps[best.child.index][targetIndex] ||
        (nextRemaining === dataset.minSteps[best.child.index][targetIndex] &&
          partner.rarity < bestPartnerRarity);

      if (better) {
        best = {
          from: dataset.pals[current],
          partner,
          child,
          role,
        };
        bestPartnerRarity = partner.rarity;
      }
    }

    if (!best) {
      return {
        steps,
        totalBreeds: distance,
        unreachable: true,
        kind: "chain",
      };
    }

    steps.push(best);
    current = best.child.index;
  }

  return {
    steps,
    totalBreeds: steps.length,
    unreachable: current !== targetIndex,
    kind: "chain",
  };
}

/**
 * Shortest chain that visits ordered waypoints (route-through),
 * then finishes at the target.
 *
 * Example: Start → Waypoint₁ → Waypoint₂ → Target
 */
export function findPathThroughWaypoints(
  dataset: BreedingDataset,
  startIndex: number,
  waypointIndexes: number[],
  targetIndex: number,
  options: PathOptions = {},
): PathResult {
  const nodes = [startIndex, ...waypointIndexes, targetIndex];
  // Drop consecutive duplicates
  const cleaned: number[] = [];
  for (const node of nodes) {
    if (cleaned.length === 0 || cleaned[cleaned.length - 1] !== node) {
      cleaned.push(node);
    }
  }

  const steps: PathStep[] = [];
  let unreachable = false;

  for (let i = 0; i < cleaned.length - 1; i++) {
    const from = cleaned[i];
    const to = cleaned[i + 1];
    const isLast = i === cleaned.length - 2;
    const role: PathStep["role"] = isLast ? "finish" : "chain";
    const segment = findShortestPath(dataset, from, to, options, role);
    if (segment.unreachable) {
      unreachable = true;
      break;
    }
    steps.push(...segment.steps);
  }

  const waypointNames = waypointIndexes
    .map((i) => dataset.pals[i]?.name)
    .filter(Boolean)
    .join(" → ");

  return {
    steps,
    totalBreeds: steps.length,
    unreachable,
    kind: "chain",
    summary: waypointNames
      ? `Route through ${waypointNames}`
      : "Direct shortest path",
  };
}

/**
 * Build a breeding tree that uses BOTH trait parents as lineage roots
 * and ends at the target — even when the two parents do not breed with
 * each other.
 *
 * Strategy: find a merge breed L × R → M that minimizes
 *   steps(A→L) + steps(B→R) + 1 + steps(M→Target)
 * then stitch the four pieces into one plan.
 */
export function findMergeTree(
  dataset: BreedingDataset,
  parentAIndex: number,
  parentBIndex: number,
  targetIndex: number,
  options: PathOptions = {},
): PathResult {
  if (parentAIndex === targetIndex && parentBIndex === targetIndex) {
    return {
      steps: [],
      totalBreeds: 0,
      unreachable: false,
      kind: "merge",
      summary: "Already the target species",
    };
  }

  type Candidate = {
    left: number;
    right: number;
    merge: number;
    costA: number;
    costB: number;
    costAfter: number;
    total: number;
  };

  let best: Candidate | null = null;

  const consider = (left: number, right: number, merge: number) => {
    if (options.hideTerraria) {
      if (
        dataset.pals[left]?.isTerraria ||
        dataset.pals[right]?.isTerraria ||
        dataset.pals[merge]?.isTerraria
      ) {
        return;
      }
    }

    const costA = dataset.minSteps[parentAIndex]?.[left] ?? UNREACHABLE;
    const costB = dataset.minSteps[parentBIndex]?.[right] ?? UNREACHABLE;
    if (costA >= UNREACHABLE || costB >= UNREACHABLE) return;

    const costAfter =
      merge === targetIndex
        ? 0
        : (dataset.minSteps[merge]?.[targetIndex] ?? UNREACHABLE);
    if (costAfter >= UNREACHABLE) return;

    const total = costA + costB + 1 + costAfter;
    const next: Candidate = {
      left,
      right,
      merge,
      costA,
      costB,
      costAfter,
      total,
    };

    if (
      !best ||
      total < best.total ||
      (total === best.total &&
        dataset.pals[left].rarity + dataset.pals[right].rarity <
          dataset.pals[best.left].rarity + dataset.pals[best.right].rarity)
    ) {
      best = next;
    }
  };

  for (const [a, b, child] of dataset.combos) {
    consider(a, b, child);
    if (a !== b) consider(b, a, child);
  }

  if (!best) {
    return {
      steps: [],
      totalBreeds: UNREACHABLE,
      unreachable: true,
      kind: "merge",
      summary: "No merge tree found that uses both parents",
    };
  }

  const chosen: Candidate = best;

  const branchA = findShortestPath(
    dataset,
    parentAIndex,
    chosen.left,
    options,
    "branch-a",
  );
  const branchB = findShortestPath(
    dataset,
    parentBIndex,
    chosen.right,
    options,
    "branch-b",
  );

  if (branchA.unreachable || branchB.unreachable) {
    return {
      steps: [],
      totalBreeds: chosen.total,
      unreachable: true,
      kind: "merge",
      summary: "Could not reconstruct one of the trait branches",
    };
  }

  const leftPal = dataset.pals[chosen.left];
  const rightPal = dataset.pals[chosen.right];
  const mergePal = dataset.pals[chosen.merge];

  const mergeStep: PathStep = {
    from: leftPal,
    partner: rightPal,
    child: mergePal,
    role: "merge",
  };

  const finish =
    chosen.merge === targetIndex
      ? { steps: [] as PathStep[], unreachable: false }
      : findShortestPath(
          dataset,
          chosen.merge,
          targetIndex,
          options,
          "finish",
        );

  if (finish.unreachable) {
    return {
      steps: [],
      totalBreeds: chosen.total,
      unreachable: true,
      kind: "merge",
      summary: "Merge reached, but could not finish to the target",
    };
  }

  const steps = [
    ...branchA.steps,
    ...branchB.steps,
    mergeStep,
    ...finish.steps,
  ];

  return {
    steps,
    totalBreeds: steps.length,
    unreachable: false,
    kind: "merge",
    summary: `Merge ${leftPal.name} × ${rightPal.name} → ${mergePal.name}, then to target`,
    merge: {
      left: leftPal,
      right: rightPal,
      child: mergePal,
    },
  };
}

function partnerPool(
  dataset: BreedingDataset,
  targetIndex: number,
  options: PathOptions,
): Pal[] {
  return dataset.pals.filter((p) => {
    if (options.hideTerraria && p.isTerraria) return false;
    if (!options.includeTargetAsParent && p.index === targetIndex) return false;
    return true;
  });
}

export interface OwnedBreedWave {
  generation: number;
  pals: Pal[];
}

export interface OwnedBreedResult {
  owned: Pal[];
  waves: OwnedBreedWave[];
  missing: Pal[];
}

/** Multi-pal breeder: what new species appear in 1st/2nd/3rd breed waves. */
export function multiPalBreeder(
  dataset: BreedingDataset,
  ownedIndexes: number[],
  options: { hideTerraria?: boolean; generations?: number } = {},
): OwnedBreedResult {
  const generations = options.generations ?? 3;
  const available = new Set(ownedIndexes);
  const waves: OwnedBreedWave[] = [];

  for (let gen = 1; gen <= generations; gen++) {
    const pool = [...available];
    const newly = new Set<number>();

    for (let i = 0; i < pool.length; i++) {
      for (let j = i; j < pool.length; j++) {
        const child = findChild(dataset, pool[i], pool[j]);
        if (!child) continue;
        if (options.hideTerraria && child.isTerraria) continue;
        if (available.has(child.index)) continue;
        newly.add(child.index);
      }
    }

    const pals = [...newly]
      .map((index) => dataset.pals[index])
      .sort(comparePals);
    waves.push({ generation: gen, pals });
    for (const index of newly) available.add(index);
  }

  const missing = dataset.pals
    .filter((p) => {
      if (options.hideTerraria && p.isTerraria) return false;
      return !available.has(p.index);
    })
    .sort(comparePals);

  return {
    owned: ownedIndexes.map((i) => dataset.pals[i]).sort(comparePals),
    waves,
    missing,
  };
}
