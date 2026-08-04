/**
 * Specimen overlay schema — instances from a server save / LLM harness
 * (e.g. Chester’s tool). Display-only; no IV/passive breeding simulation.
 *
 * Primary identity for matching: species + level covers ~90% of cases.
 */
export const SPECIMEN_SCHEMA = "pal-trait-calculator/specimen/v1" as const;

export type SpecimenGender = "male" | "female" | "unknown";

/** In-game passive rank arrow / nameplate tier. */
export type SpecimenPassiveRank =
  | "rainbow"
  | 3
  | 2
  | 1
  | 0
  | -1
  | -2
  | -3;

export type SpecimenPassive = {
  name: string;
  rank?: SpecimenPassiveRank | string;
  description?: string;
};

export type SpecimenIvs = {
  hp?: number;
  attack?: number;
  defense?: number;
};

export type SpecimenStats = {
  hp?: number;
  attack?: number;
  defense?: number;
  /** Work Speed — game base is 70 before passives. */
  workSpeed?: number;
};

export type SpecimenRole =
  | "traitA"
  | "traitB"
  | "start"
  | "target"
  | "waypoint"
  | "partner"
  | "owned";

export type SpecimenV1 = {
  /** Stable id from the harness (optional). */
  id?: string;
  /** Display / species name (e.g. "Lyleen Noct"). */
  species: string;
  /** Engine internal name (e.g. "LilyQueen_Dark"). */
  internalName?: string;
  nickname?: string;
  /** Optional override portrait URL; otherwise we use species icon. */
  portraitUrl?: string;
  owner?: string;
  /** Party / Box / Base / etc. */
  where?: string;
  guild?: string;
  /** Most important instance discriminator after species. */
  level?: number;
  gender?: SpecimenGender;
  /** Condenser / star rank (typically 0–4). */
  rank?: number;
  stars?: number;
  alpha?: boolean;
  /** Element type label(s), e.g. "Dark". */
  element?: string;
  elements?: string[];
  passives?: Array<string | SpecimenPassive>;
  ivs?: SpecimenIvs;
  stats?: SpecimenStats;
  /** e.g. "computed lower bound, not read from the save." */
  calcNote?: string;
  calcNotes?: string[];
  /** Hint which planner slot / tree role this binds to. */
  role?: SpecimenRole | string;
};

export type SpecimenBundleV1 = {
  schema: typeof SPECIMEN_SCHEMA;
  pals: SpecimenV1[];
};

/** Known rainbow / high-tier passives for nameplate styling when rank omitted. */
const PASSIVE_RANK_HINTS: Record<string, SpecimenPassiveRank> = {
  legend: "rainbow",
  lucky: "rainbow",
  "golden touch": "rainbow",
  philanthropist: "rainbow",
  "siren of the void": "rainbow",
  "eternal flame": "rainbow",
  invader: "rainbow",
  vampiric: "rainbow",
  "heart of the immovable king": "rainbow",
  "eternal engine": "rainbow",
  swift: "rainbow",
  "mastery of fasting": "rainbow",
  "diamond body": "rainbow",
  "remarkable craftsmanship": "rainbow",
  "demon god": "rainbow",
  musclehead: 3,
  ferocious: 3,
  "burly body": 3,
  workaholic: 3,
  serenity: 3,
  "spirit emperor": 3,
  idiosyncratic: 3,
  "work slave": 1,
  glutton: -1,
};

export function isSpecimenV1(value: unknown): value is SpecimenV1 {
  if (!value || typeof value !== "object") return false;
  const s = value as SpecimenV1;
  return typeof s.species === "string" && s.species.trim().length > 0;
}

export function normalizeSpecimens(raw: unknown): SpecimenV1[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(isSpecimenV1).map(normalizeSpecimen);
  if (typeof raw === "object" && Array.isArray((raw as SpecimenBundleV1).pals)) {
    return (raw as SpecimenBundleV1).pals
      .filter(isSpecimenV1)
      .map(normalizeSpecimen);
  }
  return [];
}

function normalizeSpecimen(s: SpecimenV1): SpecimenV1 {
  return {
    ...s,
    passives: s.passives?.map(normalizePassive),
  };
}

export function normalizePassive(
  raw: string | SpecimenPassive,
): SpecimenPassive {
  if (typeof raw === "string") {
    return { name: raw.trim(), rank: hintPassiveRank(raw) };
  }
  const name = raw.name?.trim() ?? "";
  return {
    name,
    rank: raw.rank ?? hintPassiveRank(name),
    description: raw.description,
  };
}

export function hintPassiveRank(name: string): SpecimenPassiveRank | undefined {
  return PASSIVE_RANK_HINTS[name.trim().toLowerCase()];
}

export function passiveRankClass(
  rank: SpecimenPassiveRank | string | undefined,
): string {
  if (rank == null) return "rank-unknown";
  if (rank === "rainbow") return "rank-rainbow";
  const n = Number(rank);
  if (n === 3) return "rank-plus3";
  if (n === 2) return "rank-plus2";
  if (n === 1) return "rank-plus1";
  if (n === 0) return "rank-neutral";
  if (n === -1) return "rank-minus1";
  if (n === -2) return "rank-minus2";
  if (n === -3) return "rank-minus3";
  return "rank-unknown";
}

/** Display title: nickname or species. */
export function specimenTitle(s: SpecimenV1): string {
  return s.nickname?.trim() || s.species;
}

/**
 * Human label emphasizing species + level (primary identity),
 * then owner when present.
 */
export function specimenLabel(s: SpecimenV1): string {
  const title = specimenTitle(s);
  const bits = [title];
  if (s.level != null) bits.push(`Lv ${s.level}`);
  if (s.owner?.trim()) bits.push(s.owner.trim());
  return bits.join(" · ");
}

export function specimenStars(s: SpecimenV1): number | null {
  const n = s.stars ?? s.rank;
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.max(0, Math.min(5, Math.round(Number(n))));
}

export function specimenElements(s: SpecimenV1): string[] {
  if (s.elements?.length) return s.elements;
  if (s.element?.trim()) return [s.element.trim()];
  return [];
}

export function specimenCalcNotes(s: SpecimenV1): string[] {
  const notes: string[] = [];
  if (s.calcNote?.trim()) notes.push(s.calcNote.trim());
  if (s.calcNotes?.length) {
    for (const n of s.calcNotes) {
      if (n?.trim()) notes.push(n.trim());
    }
  }
  return notes;
}

export function specimensForSpecies(
  specimens: SpecimenV1[],
  speciesName: string,
): SpecimenV1[] {
  const key = speciesName.trim().toLowerCase();
  return specimens.filter((s) => s.species.trim().toLowerCase() === key);
}

/** Prefer level match when multiple of the same species are injected. */
export function matchSpecimens(
  specimens: SpecimenV1[],
  speciesName: string,
  level?: number | null,
): SpecimenV1[] {
  const bySpecies = specimensForSpecies(specimens, speciesName);
  if (level == null || bySpecies.length <= 1) return bySpecies;
  const leveled = bySpecies.filter((s) => s.level === level);
  return leveled.length ? leveled : bySpecies;
}
