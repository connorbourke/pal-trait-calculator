import type { PathStep } from "./path";
import type { SpecimenGender, SpecimenPassive, SpecimenV1 } from "./specimens";

/**
 * One side of a shared breeding step — species name plus optional
 * instance fields (Chester table rows map here).
 */
export type ShareTreePal = {
  species: string;
  internalName?: string;
  nickname?: string;
  gender?: SpecimenGender;
  level?: number;
  passives?: Array<string | SpecimenPassive>;
  /** Bind to a specimen id already in `specimens[]`. */
  specimenId?: string;
  owner?: string;
  where?: string;
  guild?: string;
  alpha?: boolean;
  stars?: number;
  rank?: number;
  element?: string;
  ivs?: SpecimenV1["ivs"];
  stats?: SpecimenV1["stats"];
};

export type ShareTreeStep = {
  /** Parent A / left */
  from: string | ShareTreePal;
  /** Parent B / right */
  partner: string | ShareTreePal;
  /** Child produced */
  child: string | ShareTreePal;
  role?: PathStep["role"];
  /** Chester “Pool” column, e.g. "3, clean" or 3 */
  pool?: string | number;
  /** Freeform note for the step */
  note?: string;
};

/** Full breeding tree Chester (or we) can ship with a share link. */
export type ShareTreeV1 = {
  kind?: "chain" | "merge";
  summary?: string;
  steps: ShareTreeStep[];
  merge?: {
    left: string | ShareTreePal;
    right: string | ShareTreePal;
    child: string | ShareTreePal;
  };
};
