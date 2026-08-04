import type { BreedingDataset, Pal } from "./types";
import type { PathResult, PathStep } from "./path";
import {
  normalizePassive,
  normalizeSpecimens,
  type SpecimenV1,
} from "./specimens";
import {
  pathResultFromSnapshot,
  snapshotPathResult,
  type SavedPathPlan,
} from "./savedPaths";
import type {
  ShareTreePal,
  ShareTreeV1,
} from "./shareTree";

export type { ShareTreePal, ShareTreeStep, ShareTreeV1 } from "./shareTree";

export const SHARE_VERSION = 1 as const;

/** Compact share payload — encoded into URL hash or built by the API. */
export type SharePayloadV1 = {
  v: typeof SHARE_VERSION;
  mode: "merge" | "chain";
  /** Merge trait parent A */
  a?: string;
  /** Merge trait parent B */
  b?: string;
  /** Target species */
  t: string;
  /** Chain start species */
  s?: string;
  /** Chain waypoints */
  w?: string[];
  /** includeTargetAsParent */
  itp?: boolean;
  /** Optional instance overlays from a save harness */
  specimens?: SpecimenV1[];
  /**
   * Explicit breeding tree (preferred when Chester already planned steps).
   * When present, the app shows this tree instead of recomputing candidates.
   */
  tree?: ShareTreeV1;
  /** Optional title for the plan when saved */
  name?: string;
};

export type ResolvedShare = {
  payload: SharePayloadV1;
  mode: "merge" | "chain";
  traitA: Pal | null;
  traitB: Pal | null;
  start: Pal | null;
  target: Pal | null;
  waypoints: Pal[];
  includeTargetAsParent: boolean;
  specimens: SpecimenV1[];
  unresolved: string[];
  /** When Chester sent a full tree, a ready-to-view / save plan. */
  importedPlan: SavedPathPlan | null;
};

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const b64 = padded + pad;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

export function resolvePalName(
  dataset: BreedingDataset,
  name: string | undefined | null,
): Pal | null {
  if (!name?.trim()) return null;
  const raw = name.trim();
  const byName = dataset.byName.get(raw.toLowerCase());
  if (byName) return byName;
  const byInternal = dataset.byInternalName.get(raw);
  if (byInternal) return byInternal;
  const compact = raw.toLowerCase().replace(/[\s'_-]+/g, "");
  for (const pal of dataset.pals) {
    if (pal.name.toLowerCase().replace(/[\s'_-]+/g, "") === compact) return pal;
    if (pal.internalName.toLowerCase().replace(/[\s'_-]+/g, "") === compact) {
      return pal;
    }
  }
  return null;
}

function speciesOf(value: string | ShareTreePal): string {
  return typeof value === "string" ? value : value.species;
}

function treePalToSpecimen(
  value: string | ShareTreePal,
  fallbackId: string,
): SpecimenV1 | null {
  if (typeof value === "string") return null;
  const pal = value;
  const hasInstance =
    pal.level != null ||
    pal.gender != null ||
    (pal.passives?.length ?? 0) > 0 ||
    pal.nickname != null ||
    pal.owner != null ||
    pal.ivs != null ||
    pal.stats != null ||
    pal.alpha != null ||
    pal.stars != null ||
    pal.element != null;
  if (!hasInstance && !pal.specimenId) return null;
  return {
    id: pal.specimenId ?? fallbackId,
    species: pal.species,
    internalName: pal.internalName,
    nickname: pal.nickname,
    gender: pal.gender,
    level: pal.level,
    passives: pal.passives?.map(normalizePassive),
    owner: pal.owner,
    where: pal.where,
    guild: pal.guild,
    alpha: pal.alpha,
    stars: pal.stars,
    rank: pal.rank,
    element: pal.element,
    ivs: pal.ivs,
    stats: pal.stats,
  };
}

/**
 * Resolve Chester’s step table into a PathResult + any embedded specimens.
 */
export function resolveShareTree(
  dataset: BreedingDataset,
  tree: ShareTreeV1,
  mode: "merge" | "chain",
): {
  path: PathResult | null;
  specimens: SpecimenV1[];
  unresolved: string[];
} {
  const unresolved: string[] = [];
  const specimens: SpecimenV1[] = [];
  const steps: PathStep[] = [];

  const resolveSide = (
    value: string | ShareTreePal,
    label: string,
    stepIndex: number,
    side: string,
  ): Pal | null => {
    const name = speciesOf(value);
    const pal = resolvePalName(dataset, name);
    if (!pal) {
      unresolved.push(`${label}: ${name}`);
      return null;
    }
    const specimen = treePalToSpecimen(
      value,
      `tree-${stepIndex}-${side}-${pal.index}`,
    );
    if (specimen) specimens.push(specimen);
    return pal;
  };

  tree.steps.forEach((step, i) => {
    const from = resolveSide(step.from, `step ${i + 1} from`, i, "from");
    const partner = resolveSide(
      step.partner,
      `step ${i + 1} partner`,
      i,
      "partner",
    );
    const child = resolveSide(step.child, `step ${i + 1} child`, i, "child");
    if (!from || !partner || !child) return;

    steps.push({
      from,
      partner,
      child,
      role: step.role ?? (mode === "chain" ? "chain" : undefined),
      pool: step.pool,
      note: step.note?.trim() || undefined,
    });
  });

  if (steps.length === 0) {
    return { path: null, specimens, unresolved };
  }

  let merge: PathResult["merge"];
  if (tree.merge) {
    const left = resolveSide(tree.merge.left, "merge left", -1, "mleft");
    const right = resolveSide(tree.merge.right, "merge right", -1, "mright");
    const child = resolveSide(tree.merge.child, "merge child", -1, "mchild");
    if (left && right && child) merge = { left, right, child };
  } else if (mode === "merge") {
    const mergeStep =
      steps.find((s) => s.role === "merge") ?? steps[steps.length - 1];
    if (mergeStep) {
      merge = {
        left: mergeStep.from,
        right: mergeStep.partner,
        child: mergeStep.child,
      };
    }
  }

  const kind = tree.kind ?? mode;
  const path: PathResult = {
    kind,
    summary: tree.summary?.trim() || undefined,
    totalBreeds: steps.length,
    unreachable: false,
    steps,
    merge,
  };

  return { path, specimens, unresolved };
}

export function planFromShareTree(
  dataset: BreedingDataset,
  payload: SharePayloadV1,
  path: PathResult,
  specimens: SpecimenV1[],
): SavedPathPlan {
  const name =
    payload.name?.trim() ||
    (payload.mode === "merge" && payload.a && payload.b
      ? `${payload.a} × ${payload.b} → ${payload.t}`
      : `${payload.s ?? "Start"} → ${payload.t}`);

  return {
    id: `shared-${Date.now()}`,
    name,
    savedAt: Date.now(),
    plannerMode: payload.mode,
    pathTraitA: resolvePalName(dataset, payload.a)?.index,
    pathTraitB: resolvePalName(dataset, payload.b)?.index,
    pathTarget: resolvePalName(dataset, payload.t)?.index,
    pathStart: resolvePalName(dataset, payload.s)?.index,
    waypoints: (payload.w ?? [])
      .map((n) => resolvePalName(dataset, n)?.index)
      .filter((i): i is number => i != null),
    includeTargetAsParent: Boolean(payload.itp),
    result: snapshotPathResult(path),
    completedStepKeys: [],
    specimens,
    tree: payload.tree,
    source: "share",
  };
}

export function compactSharePayload(payload: SharePayloadV1): SharePayloadV1 {
  const out: SharePayloadV1 = { v: 1, mode: payload.mode, t: payload.t.trim() };
  if (payload.mode === "merge") {
    if (payload.a?.trim()) out.a = payload.a.trim();
    if (payload.b?.trim()) out.b = payload.b.trim();
  } else {
    if (payload.s?.trim()) out.s = payload.s.trim();
    if (payload.w?.length) {
      out.w = payload.w.map((x) => x.trim()).filter(Boolean);
    }
  }
  if (payload.itp) out.itp = true;
  if (payload.specimens?.length) out.specimens = payload.specimens;
  if (payload.tree?.steps?.length) out.tree = payload.tree;
  if (payload.name?.trim()) out.name = payload.name.trim();
  return out;
}

export function encodeSharePayload(payload: SharePayloadV1): string {
  return encodeBase64Url(JSON.stringify(compactSharePayload(payload)));
}

function isShareTree(value: unknown): value is ShareTreeV1 {
  if (!value || typeof value !== "object") return false;
  const tree = value as ShareTreeV1;
  return Array.isArray(tree.steps) && tree.steps.length > 0;
}

export function decodeSharePayload(encoded: string): SharePayloadV1 | null {
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as SharePayloadV1;
    if (!parsed || parsed.v !== 1) return null;
    if (parsed.mode !== "merge" && parsed.mode !== "chain") return null;
    if (typeof parsed.t !== "string" || !parsed.t.trim()) return null;
    return {
      ...parsed,
      specimens: normalizeSpecimens(parsed.specimens),
      tree: isShareTree(parsed.tree) ? parsed.tree : undefined,
    };
  } catch {
    return null;
  }
}

/** Hash fragment: #share=<base64url> */
export function buildShareHash(payload: SharePayloadV1): string {
  return `#share=${encodeSharePayload(payload)}`;
}

/** Absolute or path view URL for chatbot hyperlinks. */
export function buildViewUrl(
  payload: SharePayloadV1,
  origin?: string,
): string {
  const hash = buildShareHash(payload);
  if (origin) return `${origin.replace(/\/$/, "")}/${hash}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/${hash}`;
  }
  return `/${hash}`;
}

export function parseShareFromLocation(
  search: string,
  hash: string,
): SharePayloadV1 | null {
  const hashBody = hash.startsWith("#") ? hash.slice(1) : hash;
  const hashParams = new URLSearchParams(hashBody);
  const shareFromHash = hashParams.get("share");
  if (shareFromHash) {
    return decodeSharePayload(shareFromHash);
  }

  const query = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const shareFromQuery = query.get("share");
  if (shareFromQuery) return decodeSharePayload(shareFromQuery);

  const mode = query.get("mode");
  const t = query.get("t") ?? query.get("target");
  if ((mode === "merge" || mode === "chain") && t?.trim()) {
    const payload: SharePayloadV1 = {
      v: 1,
      mode,
      t: t.trim(),
      itp: query.get("itp") === "1" || query.get("itp") === "true",
    };
    if (mode === "merge") {
      payload.a = query.get("a") ?? query.get("traitA") ?? undefined;
      payload.b = query.get("b") ?? query.get("traitB") ?? undefined;
    } else {
      payload.s = query.get("s") ?? query.get("start") ?? undefined;
      const via = query.get("via") ?? query.get("w");
      if (via) {
        payload.w = via
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      }
    }
    return payload;
  }

  return null;
}

export function resolveSharePayload(
  dataset: BreedingDataset,
  payload: SharePayloadV1,
): ResolvedShare {
  const unresolved: string[] = [];
  const track = (label: string, name: string | undefined, pal: Pal | null) => {
    if (name?.trim() && !pal) unresolved.push(`${label}: ${name.trim()}`);
    return pal;
  };

  const target = track("target", payload.t, resolvePalName(dataset, payload.t));
  const traitA = track("traitA", payload.a, resolvePalName(dataset, payload.a));
  const traitB = track("traitB", payload.b, resolvePalName(dataset, payload.b));
  const start = track("start", payload.s, resolvePalName(dataset, payload.s));
  const waypoints: Pal[] = [];
  for (const name of payload.w ?? []) {
    const pal = resolvePalName(dataset, name);
    if (pal) waypoints.push(pal);
    else unresolved.push(`waypoint: ${name}`);
  }

  let specimens = normalizeSpecimens(payload.specimens);
  let importedPlan: SavedPathPlan | null = null;

  if (payload.tree?.steps?.length) {
    const resolved = resolveShareTree(dataset, payload.tree, payload.mode);
    unresolved.push(...resolved.unresolved);
    const byId = new Map<string, SpecimenV1>();
    for (const s of resolved.specimens) {
      byId.set(s.id ?? `${s.species}-${s.level ?? ""}`, s);
    }
    for (const s of specimens) {
      byId.set(s.id ?? `${s.species}-${s.level ?? ""}`, s);
    }
    specimens = [...byId.values()];

    if (resolved.path) {
      importedPlan = planFromShareTree(
        dataset,
        payload,
        resolved.path,
        specimens,
      );
    }
  }

  return {
    payload,
    mode: payload.mode,
    traitA,
    traitB,
    start,
    target,
    waypoints,
    includeTargetAsParent: Boolean(payload.itp),
    specimens,
    unresolved,
    importedPlan,
  };
}

export function sharePayloadFromPlanner(input: {
  mode: "merge" | "chain";
  traitA?: Pal | null;
  traitB?: Pal | null;
  start?: Pal | null;
  target: Pal | null;
  waypoints?: Pal[];
  includeTargetAsParent?: boolean;
  specimens?: SpecimenV1[];
  tree?: ShareTreeV1;
  name?: string;
}): SharePayloadV1 | null {
  if (!input.target) return null;
  if (input.mode === "merge") {
    if (!input.traitA || !input.traitB) return null;
    return compactSharePayload({
      v: 1,
      mode: "merge",
      a: input.traitA.name,
      b: input.traitB.name,
      t: input.target.name,
      itp: input.includeTargetAsParent,
      specimens: input.specimens,
      tree: input.tree,
      name: input.name,
    });
  }
  if (!input.start) return null;
  return compactSharePayload({
    v: 1,
    mode: "chain",
    s: input.start.name,
    t: input.target.name,
    w: input.waypoints?.map((p) => p.name),
    itp: input.includeTargetAsParent,
    specimens: input.specimens,
    tree: input.tree,
    name: input.name,
  });
}

/** Build a share tree from a PathResult (for copy/API). */
export function shareTreeFromPath(
  path: PathResult,
  specimens: SpecimenV1[] = [],
): ShareTreeV1 {
  const bySpecies = (name: string): string | ShareTreePal => {
    const matches = specimens.filter(
      (s) => s.species.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (matches.length === 0) return name;
    // Prefer the richest match (most passives / gender / level).
    const best = [...matches].sort((a, b) => {
      const score = (s: SpecimenV1) =>
        (s.passives?.length ?? 0) * 10 +
        (s.gender && s.gender !== "unknown" ? 3 : 0) +
        (s.level != null ? 1 : 0);
      return score(b) - score(a);
    })[0];
    return {
      species: best.species,
      internalName: best.internalName,
      nickname: best.nickname,
      gender: best.gender,
      level: best.level,
      passives: best.passives,
      specimenId: best.id,
      owner: best.owner,
      where: best.where,
      guild: best.guild,
      alpha: best.alpha,
      stars: best.stars,
      rank: best.rank,
      element: best.element,
      ivs: best.ivs,
      stats: best.stats,
    };
  };

  return {
    kind: path.kind,
    summary: path.summary,
    steps: path.steps.map((step) => ({
      from: bySpecies(step.from.name),
      partner: bySpecies(step.partner.name),
      child: bySpecies(step.child.name),
      role: step.role,
      pool: step.pool,
      note: step.note,
    })),
    merge: path.merge
      ? {
          left: bySpecies(path.merge.left.name),
          right: bySpecies(path.merge.right.name),
          child: bySpecies(path.merge.child.name),
        }
      : undefined,
  };
}

/** Prefer an explicit tree; otherwise rebuild from a saved/computed path. */
export function treeForShare(
  plan?: Pick<SavedPathPlan, "tree" | "result" | "specimens"> | null,
  path?: PathResult | null,
  specimens?: SpecimenV1[],
): ShareTreeV1 | undefined {
  if (plan?.tree?.steps?.length) return plan.tree;
  if (path?.steps.length) {
    return shareTreeFromPath(path, specimens ?? plan?.specimens ?? []);
  }
  if (plan?.result.steps.length) {
    return shareTreeFromPath(
      pathResultFromSnapshot(plan.result),
      plan.specimens ?? specimens ?? [],
    );
  }
  return undefined;
}
