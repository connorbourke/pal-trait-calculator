import type { PathResult, PathStep } from "./path";
import type { ShareTreeV1 } from "./shareTree";
import {
  normalizeSpecimens,
  type SpecimenV1,
} from "./specimens";

const SAVED_PATHS_KEY = "pal-trait-calculator.savedPaths";
const MAX_SAVED_PATHS = 20;

export type SavedPalRef = {
  index: number;
  name: string;
  dex: string;
};

export type SavedPathStep = {
  from: SavedPalRef;
  partner: SavedPalRef;
  child: SavedPalRef;
  role?: PathStep["role"];
  /** Chester pool column, e.g. "3, clean" */
  pool?: string | number;
  /** Freeform step note */
  note?: string;
};

export type SavedPathPlan = {
  id: string;
  name: string;
  savedAt: number;
  plannerMode: "merge" | "chain";
  pathTraitA?: number;
  pathTraitB?: number;
  pathTarget?: number;
  pathStart?: number;
  waypoints?: number[];
  includeTargetAsParent?: boolean;
  result: {
    kind: "chain" | "merge";
    summary?: string;
    totalBreeds: number;
    unreachable: boolean;
    steps: SavedPathStep[];
    merge?: {
      left: SavedPalRef;
      right: SavedPalRef;
      child: SavedPalRef;
    };
  };
  completedStepKeys: string[];
  /** Injected instance cards (Chester / share links). */
  specimens?: SpecimenV1[];
  /** Exact breeding tree from share (genders, passives, pool). */
  tree?: ShareTreeV1;
  /** Where the plan came from. */
  source?: "local" | "share";
};

export function pathStepKey(step: {
  role?: string;
  from: { index: number };
  partner: { index: number };
  child: { index: number };
}): string {
  return `${step.role ?? "step"}:${step.from.index}-${step.partner.index}-${step.child.index}`;
}

function palRef(pal: { index: number; name: string; dex: string }): SavedPalRef {
  return { index: pal.index, name: pal.name, dex: pal.dex };
}

export function snapshotPathResult(path: PathResult): SavedPathPlan["result"] {
  return {
    kind: path.kind,
    summary: path.summary,
    totalBreeds: path.totalBreeds,
    unreachable: path.unreachable,
    steps: path.steps.map((step) => ({
      from: palRef(step.from),
      partner: palRef(step.partner),
      child: palRef(step.child),
      role: step.role,
      pool: step.pool,
      note: step.note,
    })),
    merge: path.merge
      ? {
          left: palRef(path.merge.left),
          right: palRef(path.merge.right),
          child: palRef(path.merge.child),
        }
      : undefined,
  };
}

/** Rebuild a display PathResult from a saved snapshot (names survive data churn). */
export function pathResultFromSnapshot(
  result: SavedPathPlan["result"],
): PathResult {
  const toPal = (ref: SavedPalRef) =>
    ({
      index: ref.index,
      name: ref.name,
      dex: ref.dex,
      // Minimal fields for PalPortrait / labels
      internalName: "",
      dexNo: 0,
      isVariant: false,
      breedingPower: 0,
      rarity: 0,
      difficulty: "mid" as const,
      minWildLevel: null,
      maxWildLevel: null,
      price: null,
      nocturnal: false,
      isTerraria: false,
      isWorldTreeLocked: false,
      isWorldTreeBreedable: false,
      work: [],
    });

  return {
    kind: result.kind,
    summary: result.summary,
    totalBreeds: result.totalBreeds,
    unreachable: result.unreachable,
    steps: result.steps.map((step) => ({
      from: toPal(step.from),
      partner: toPal(step.partner),
      child: toPal(step.child),
      role: step.role,
      pool: step.pool,
      note: step.note,
    })),
    merge: result.merge
      ? {
          left: toPal(result.merge.left),
          right: toPal(result.merge.right),
          child: toPal(result.merge.child),
        }
      : undefined,
  };
}

function isSavedPalRef(value: unknown): value is SavedPalRef {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as SavedPalRef).index === "number" &&
    typeof (value as SavedPalRef).name === "string" &&
    typeof (value as SavedPalRef).dex === "string"
  );
}

function isSavedPathStep(value: unknown): value is SavedPathStep {
  if (!value || typeof value !== "object") return false;
  const step = value as SavedPathStep;
  return (
    isSavedPalRef(step.from) &&
    isSavedPalRef(step.partner) &&
    isSavedPalRef(step.child)
  );
}

function isSavedPathPlan(value: unknown): value is SavedPathPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as SavedPathPlan;
  return (
    typeof plan.id === "string" &&
    typeof plan.name === "string" &&
    typeof plan.savedAt === "number" &&
    (plan.plannerMode === "merge" || plan.plannerMode === "chain") &&
    !!plan.result &&
    typeof plan.result === "object" &&
    Array.isArray(plan.result.steps) &&
    plan.result.steps.every(isSavedPathStep) &&
    Array.isArray(plan.completedStepKeys)
  );
}

export function loadSavedPathPlans(): SavedPathPlan[] {
  try {
    const raw = localStorage.getItem(SAVED_PATHS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedPathPlan).map((plan) => ({
      ...plan,
      specimens: normalizeSpecimens(plan.specimens),
      tree:
        plan.tree &&
        Array.isArray(plan.tree.steps) &&
        plan.tree.steps.length > 0
          ? plan.tree
          : undefined,
      source: plan.source === "share" ? "share" : plan.source ?? "local",
    }));
  } catch {
    return [];
  }
}

function writeSavedPathPlans(plans: SavedPathPlan[]): void {
  localStorage.setItem(SAVED_PATHS_KEY, JSON.stringify(plans));
}

export function upsertSavedPathPlan(plan: SavedPathPlan): SavedPathPlan[] {
  const plans = loadSavedPathPlans().filter((p) => p.id !== plan.id);
  plans.unshift(plan);
  const trimmed = plans.slice(0, MAX_SAVED_PATHS);
  writeSavedPathPlans(trimmed);
  return trimmed;
}

export function deleteSavedPathPlan(id: string): SavedPathPlan[] {
  const plans = loadSavedPathPlans().filter((p) => p.id !== id);
  writeSavedPathPlans(plans);
  return plans;
}

export function updateSavedPathProgress(
  id: string,
  completedStepKeys: string[],
): SavedPathPlan[] {
  const plans = loadSavedPathPlans().map((plan) =>
    plan.id === id ? { ...plan, completedStepKeys } : plan,
  );
  writeSavedPathPlans(plans);
  return plans;
}

export function createSavedPathPlanId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultPlanName(
  path: PathResult,
  plannerMode: "merge" | "chain",
  inputs?: {
    traitA?: string | null;
    traitB?: string | null;
    target?: string | null;
    start?: string | null;
  },
): string {
  if (plannerMode === "merge") {
    const a = inputs?.traitA;
    const b = inputs?.traitB;
    const target = inputs?.target;
    if (a && b && target) return `${a} × ${b} → ${target}`;
  }
  if (plannerMode === "chain") {
    const start = inputs?.start;
    const target = inputs?.target;
    if (start && target) return `${start} → ${target}`;
  }
  const first = path.steps[0]?.from.name;
  const last = path.steps[path.steps.length - 1]?.child.name;
  if (first && last) return `${first} → ${last}`;
  return plannerMode === "merge" ? "Merge plan" : "Route plan";
}
