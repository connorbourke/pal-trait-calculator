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
  const candidates = findChainCandidates(
    dataset,
    startIndex,
    waypointIndexes,
    targetIndex,
    options,
  );
  if (candidates.length === 0) {
    const distance =
      dataset.minSteps[startIndex]?.[targetIndex] ?? UNREACHABLE;
    return {
      steps: [],
      totalBreeds: distance,
      unreachable: true,
      kind: "chain",
      summary: "No breeding route found for that setup",
    };
  }
  return candidates[0];
}

const MAX_CHAIN_CANDIDATES = 800;
const MAX_SEGMENT_PATHS = 120;
/** Include near-shortest routes up to this many breeds past optimal. */
const CHAIN_LENGTH_SLACK = 2;

/**
 * All near-shortest route-through chains (capped), fewest breeds first, then
 * lower partner rarity sum for stable ordering. Includes routes up to
 * shortest + CHAIN_LENGTH_SLACK breeds.
 */
export function findChainCandidates(
  dataset: BreedingDataset,
  startIndex: number,
  waypointIndexes: number[],
  targetIndex: number,
  options: PathOptions = {},
): PathResult[] {
  const nodes = [startIndex, ...waypointIndexes, targetIndex];
  const cleaned: number[] = [];
  for (const node of nodes) {
    if (cleaned.length === 0 || cleaned[cleaned.length - 1] !== node) {
      cleaned.push(node);
    }
  }

  if (cleaned.length === 1) {
    return [
      {
        steps: [],
        totalBreeds: 0,
        unreachable: false,
        kind: "chain",
        summary: "Already at the target — no breeds needed",
      },
    ];
  }

  const waypointNames = waypointIndexes
    .map((i) => dataset.pals[i]?.name)
    .filter(Boolean)
    .join(" → ");
  const summary = waypointNames
    ? `Route through ${waypointNames}`
    : "Direct shortest path";

  let minTotal = 0;
  const segmentAlts: PathStep[][][] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    const from = cleaned[i];
    const to = cleaned[i + 1];
    const segmentDist = dataset.minSteps[from]?.[to] ?? UNREACHABLE;
    if (segmentDist >= UNREACHABLE) return [];
    minTotal += segmentDist;

    const isLast = i === cleaned.length - 2;
    const role: PathStep["role"] = isLast ? "finish" : "chain";
    const alts = enumerateNearShortestSegmentPaths(
      dataset,
      from,
      to,
      options,
      role,
      MAX_SEGMENT_PATHS,
      CHAIN_LENGTH_SLACK,
    );
    if (alts.length === 0) return [];
    segmentAlts.push(alts);
  }

  const maxTotal = minTotal + CHAIN_LENGTH_SLACK;

  let combos: PathStep[][] = [[]];
  for (const alts of segmentAlts) {
    const next: PathStep[][] = [];
    for (const prefix of combos) {
      for (const alt of alts) {
        const combined = prefix.length === 0 ? alt : [...prefix, ...alt];
        if (combined.length > maxTotal) continue;
        next.push(combined);
        if (next.length >= MAX_CHAIN_CANDIDATES) break;
      }
      if (next.length >= MAX_CHAIN_CANDIDATES) break;
    }
    combos = next;
    if (combos.length >= MAX_CHAIN_CANDIDATES) break;
  }

  const seen = new Set<string>();
  const results: PathResult[] = [];

  for (const steps of combos) {
    if (steps.length > maxTotal) continue;
    const key = steps
      .map((s) => `${s.from.index}:${s.partner.index}:${s.child.index}`)
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      steps,
      totalBreeds: steps.length,
      unreachable: false,
      kind: "chain",
      summary,
    });
  }

  results.sort((a, b) => {
    if (a.totalBreeds !== b.totalBreeds) return a.totalBreeds - b.totalBreeds;
    const rarityA = a.steps.reduce((sum, s) => sum + s.partner.rarity, 0);
    const rarityB = b.steps.reduce((sum, s) => sum + s.partner.rarity, 0);
    if (rarityA !== rarityB) return rarityA - rarityB;
    return 0;
  });

  return results;
}

/** Filter chain routes by include (AND on partners) and exclude (path involvement). */
export function filterChainCandidatesByPairingSearch(
  candidates: PathResult[],
  includeIndexes: number[],
  excludeIndexes: number[] = [],
): PathResult[] {
  const includeTags = [...new Set(includeIndexes)];
  const excludeTags = [...new Set(excludeIndexes)];
  if (includeTags.length === 0 && excludeTags.length === 0) return candidates;

  return candidates.filter((candidate) => {
    const partners = new Set(
      candidate.steps.map((step) => step.partner.index),
    );
    const involved = new Set<number>();
    for (const step of candidate.steps) {
      involved.add(step.partner.index);
      involved.add(step.child.index);
    }

    if (includeTags.some((tag) => !partners.has(tag))) return false;
    if (excludeTags.some((tag) => involved.has(tag))) return false;
    return true;
  });
}

/**
 * Enumerate breeding chains from start→target with length in
 * [shortest, shortest + slack]. Avoids species cycles.
 */
function enumerateNearShortestSegmentPaths(
  dataset: BreedingDataset,
  startIndex: number,
  targetIndex: number,
  options: PathOptions,
  role: PathStep["role"],
  maxPaths: number,
  slack: number,
): PathStep[][] {
  if (startIndex === targetIndex) return [[]];

  const distance = dataset.minSteps[startIndex]?.[targetIndex] ?? UNREACHABLE;
  if (distance >= UNREACHABLE) return [];

  const maxLength = distance + slack;
  const partners = partnerPool(dataset, targetIndex, options);
  const out: PathStep[][] = [];

  const dfs = (
    current: number,
    pathLen: number,
    acc: PathStep[],
    visited: Set<number>,
  ) => {
    if (out.length >= maxPaths) return;
    if (current === targetIndex) {
      if (pathLen >= distance && pathLen <= maxLength) {
        out.push([...acc]);
      }
      return;
    }
    if (pathLen >= maxLength) return;

    const currentDist = dataset.minSteps[current]?.[targetIndex] ?? UNREACHABLE;
    if (currentDist >= UNREACHABLE) return;
    // Must still be able to finish within the remaining budget
    if (pathLen + currentDist > maxLength) return;

    const nextSteps: PathStep[] = [];
    for (const partner of partners) {
      const child = findChild(dataset, current, partner.index);
      if (!child) continue;
      if (options.hideTerraria && child.isTerraria) continue;
      if (visited.has(child.index)) continue;

      const childDist = dataset.minSteps[child.index]?.[targetIndex] ?? UNREACHABLE;
      if (childDist >= UNREACHABLE) continue;
      if (pathLen + 1 + childDist > maxLength) continue;

      nextSteps.push({
        from: dataset.pals[current],
        partner,
        child,
        role,
      });
    }

    nextSteps.sort((a, b) => {
      const distA = dataset.minSteps[a.child.index][targetIndex];
      const distB = dataset.minSteps[b.child.index][targetIndex];
      // Prefer steps that stay closer to optimal, then lower rarity
      if (distA !== distB) return distA - distB;
      return (
        a.partner.rarity - b.partner.rarity || a.partner.index - b.partner.index
      );
    });

    for (const step of nextSteps) {
      acc.push(step);
      visited.add(step.child.index);
      dfs(step.child.index, pathLen + 1, acc, visited);
      visited.delete(step.child.index);
      acc.pop();
      if (out.length >= maxPaths) return;
    }
  };

  dfs(startIndex, 0, [], new Set([startIndex]));
  return out;
}

/** Scored merge point before path reconstruction. */

/** Scored merge point before path reconstruction. */
export interface MergeCandidate {
  left: number;
  right: number;
  merge: number;
  costA: number;
  costB: number;
  costAfter: number;
  /** steps(A→L) + steps(B→R) + 1 + steps(M→Target) */
  total: number;
}

/**
 * Score every feasible merge L × R → M for dual-root trait planning.
 * Cheap: only distance-table lookups. Sorted fewest breeds first.
 */
export function findMergeCandidates(
  dataset: BreedingDataset,
  parentAIndex: number,
  parentBIndex: number,
  targetIndex: number,
  options: PathOptions = {},
): MergeCandidate[] {
  if (parentAIndex === targetIndex && parentBIndex === targetIndex) {
    return [];
  }

  const byKey = new Map<string, MergeCandidate>();

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
    const key = `${left}:${right}:${merge}`;
    const existing = byKey.get(key);
    if (existing && existing.total <= total) return;

    byKey.set(key, {
      left,
      right,
      merge,
      costA,
      costB,
      costAfter,
      total,
    });
  };

  for (const [a, b, child] of dataset.combos) {
    consider(a, b, child);
    if (a !== b) consider(b, a, child);
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total;
    const rarityA =
      dataset.pals[a.left].rarity + dataset.pals[a.right].rarity;
    const rarityB =
      dataset.pals[b.left].rarity + dataset.pals[b.right].rarity;
    if (rarityA !== rarityB) return rarityA - rarityB;
    return a.merge - b.merge || a.left - b.left || a.right - b.right;
  });
}

/**
 * Filter merge candidates by include tags (AND) and exclude tags (AND-not).
 * Include: each tag must be a merge tip or a direct progress breed off a trait parent.
 * Exclude: drop trees where any excluded Pal appears as a tip, merge child, breed
 * partner on either branch, or partner on the finish path to target.
 */
export function filterMergeCandidatesByPairingSearch(
  dataset: BreedingDataset,
  parentAIndex: number,
  parentBIndex: number,
  targetIndex: number,
  candidates: MergeCandidate[],
  includeIndexes: number[],
  excludeIndexes: number[] = [],
  options: PathOptions = {},
): MergeCandidate[] {
  const includeTags = [...new Set(includeIndexes)];
  const excludeTags = [...new Set(excludeIndexes)];
  if (includeTags.length === 0 && excludeTags.length === 0) return candidates;

  const branchPartnersA = new Map<string, Set<number>>();
  const branchPartnersB = new Map<string, Set<number>>();
  const finishPartners = new Map<string, Set<number>>();

  return candidates.filter((candidate) => {
    if (
      includeTags.length > 0 &&
      !includeTags.every((tagIndex) =>
        candidateUsesIncludeTag(
          dataset,
          parentAIndex,
          parentBIndex,
          candidate,
          tagIndex,
          options,
        ),
      )
    ) {
      return false;
    }

    if (
      excludeTags.length > 0 &&
      excludeTags.some((tagIndex) =>
        candidateUsesExcludedPal(
          dataset,
          parentAIndex,
          parentBIndex,
          targetIndex,
          candidate,
          tagIndex,
          options,
          branchPartnersA,
          branchPartnersB,
          finishPartners,
        ),
      )
    ) {
      return false;
    }

    return true;
  });
}

function candidateUsesIncludeTag(
  dataset: BreedingDataset,
  parentAIndex: number,
  parentBIndex: number,
  candidate: MergeCandidate,
  tagIndex: number,
  options: PathOptions,
): boolean {
  if (candidate.left === tagIndex || candidate.right === tagIndex) {
    return true;
  }

  if (
    candidate.costA > 0 &&
    isProgressPartner(
      dataset,
      parentAIndex,
      candidate.left,
      tagIndex,
      options,
    )
  ) {
    return true;
  }

  if (
    candidate.costB > 0 &&
    isProgressPartner(
      dataset,
      parentBIndex,
      candidate.right,
      tagIndex,
      options,
    )
  ) {
    return true;
  }

  return false;
}

function candidateUsesExcludedPal(
  dataset: BreedingDataset,
  parentAIndex: number,
  parentBIndex: number,
  targetIndex: number,
  candidate: MergeCandidate,
  tagIndex: number,
  options: PathOptions,
  branchPartnersA: Map<string, Set<number>>,
  branchPartnersB: Map<string, Set<number>>,
  finishPartners: Map<string, Set<number>>,
): boolean {
  if (
    candidate.left === tagIndex ||
    candidate.right === tagIndex ||
    candidate.merge === tagIndex
  ) {
    return true;
  }

  if (
    pathPartnersInclude(
      dataset,
      parentAIndex,
      candidate.left,
      tagIndex,
      options,
      "branch-a",
      branchPartnersA,
    )
  ) {
    return true;
  }

  if (
    pathPartnersInclude(
      dataset,
      parentBIndex,
      candidate.right,
      tagIndex,
      options,
      "branch-b",
      branchPartnersB,
    )
  ) {
    return true;
  }

  if (
    candidate.merge !== targetIndex &&
    pathPartnersInclude(
      dataset,
      candidate.merge,
      targetIndex,
      tagIndex,
      options,
      "finish",
      finishPartners,
    )
  ) {
    return true;
  }

  return false;
}

function pathPartnersInclude(
  dataset: BreedingDataset,
  startIndex: number,
  tipIndex: number,
  tagIndex: number,
  options: PathOptions,
  role: PathStep["role"],
  cache: Map<string, Set<number>>,
): boolean {
  if (startIndex === tipIndex) return false;

  const cacheKey = `${startIndex}:${tipIndex}`;
  let partners = cache.get(cacheKey);
  if (!partners) {
    partners = new Set<number>();
    const branch = findShortestPath(
      dataset,
      startIndex,
      tipIndex,
      options,
      role,
    );
    if (!branch.unreachable) {
      for (const step of branch.steps) {
        partners.add(step.partner.index);
        partners.add(step.child.index);
      }
    }
    cache.set(cacheKey, partners);
  }

  return partners.has(tagIndex);
}

/** True when breeding `from` with `partner` moves closer to `tip`. */
function isProgressPartner(
  dataset: BreedingDataset,
  fromIndex: number,
  tipIndex: number,
  partnerIndex: number,
  options: PathOptions,
): boolean {
  if (fromIndex === tipIndex) return false;
  if (options.hideTerraria && dataset.pals[partnerIndex]?.isTerraria) {
    return false;
  }

  const child = findChild(dataset, fromIndex, partnerIndex);
  if (!child) return false;
  if (options.hideTerraria && child.isTerraria) return false;

  const remaining = dataset.minSteps[fromIndex]?.[tipIndex] ?? UNREACHABLE;
  if (remaining >= UNREACHABLE) return false;
  if (child.index === tipIndex) return true;

  const nextRemaining = dataset.minSteps[child.index]?.[tipIndex] ?? UNREACHABLE;
  return nextRemaining < remaining;
}

/**
 * Reconstruct one merge tree from a scored candidate.
 */
export function buildMergeTree(
  dataset: BreedingDataset,
  parentAIndex: number,
  parentBIndex: number,
  targetIndex: number,
  candidate: MergeCandidate,
  options: PathOptions = {},
): PathResult {
  const branchA = findShortestPath(
    dataset,
    parentAIndex,
    candidate.left,
    options,
    "branch-a",
  );
  const branchB = findShortestPath(
    dataset,
    parentBIndex,
    candidate.right,
    options,
    "branch-b",
  );

  if (branchA.unreachable || branchB.unreachable) {
    return {
      steps: [],
      totalBreeds: candidate.total,
      unreachable: true,
      kind: "merge",
      summary: "Could not reconstruct one of the trait branches",
    };
  }

  const leftPal = dataset.pals[candidate.left];
  const rightPal = dataset.pals[candidate.right];
  const mergePal = dataset.pals[candidate.merge];

  const mergeStep: PathStep = {
    from: leftPal,
    partner: rightPal,
    child: mergePal,
    role: "merge",
  };

  const finish =
    candidate.merge === targetIndex
      ? { steps: [] as PathStep[], unreachable: false }
      : findShortestPath(
          dataset,
          candidate.merge,
          targetIndex,
          options,
          "finish",
        );

  if (finish.unreachable) {
    return {
      steps: [],
      totalBreeds: candidate.total,
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

/** Best single merge tree (shortest scored cost). */
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

  const candidates = findMergeCandidates(
    dataset,
    parentAIndex,
    parentBIndex,
    targetIndex,
    options,
  );

  if (candidates.length === 0) {
    return {
      steps: [],
      totalBreeds: UNREACHABLE,
      unreachable: true,
      kind: "merge",
      summary: "No merge tree found that uses both parents",
    };
  }

  return buildMergeTree(
    dataset,
    parentAIndex,
    parentBIndex,
    targetIndex,
    candidates[0],
    options,
  );
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
