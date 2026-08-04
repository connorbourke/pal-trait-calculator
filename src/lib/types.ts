export type Difficulty = "early" | "mid" | "late" | "endgame";

/** How this species is typically first acquired (for scoring / docs). */
export type AcquisitionKind =
  | "wild"
  | "fishing"
  | "raid"
  | "meteor"
  | "chest"
  | "worldTree";

export type Gender = "WILDCARD" | "MALE" | "FEMALE";

export type Mode =
  | "parents"
  | "child"
  | "path"
  | "owned"
  | "browse";

export interface WorkSuitability {
  work: string;
  level: number;
}

export interface Pal {
  index: number;
  internalName: string;
  name: string;
  dexNo: number;
  isVariant: boolean;
  dex: string;
  breedingPower: number;
  rarity: number;
  difficulty: Difficulty;
  minWildLevel: number | null;
  maxWildLevel: number | null;
  /** Earliest field/sealed (non-tower) alpha boss level, if any. */
  minAlphaLevel: number | null;
  /**
   * Typical acquisition channel. Overrides / WT habitat may set non-wild kinds
   * even when a wild level band is present for scoring.
   */
  acquisitionKind: AcquisitionKind;
  /**
   * Precomputed at dataset load from wild band + kind/WT bumps.
   * Optional on incomplete stubs (saved-path snapshots).
   */
  acquisitionCost?: number;
  price: number | null;
  nocturnal: boolean;
  isTerraria: boolean;
  /** Wild only in World Tree and not breedable from outside stock. */
  isWorldTreeLocked: boolean;
  /** World Tree habitat, but breedable from non–World Tree parents. */
  isWorldTreeBreedable: boolean;
  work: WorkSuitability[];
}

/** [parentAIndex, parentBIndex, childIndex] */
export type Combo = [number, number, number];

/** [fromIndex, toIndex, steps] */
export type MinStepEdge = [number, number, number];

export interface SpecialGenderCombo {
  parentA: number;
  parentB: number;
  child: number;
  parentAGender: Gender;
  parentBGender: Gender;
}

export interface MutationPassive {
  internalName: string;
  name: string;
  description: string;
  rank: number | null;
}

export interface DatasetMeta {
  project: string;
  release: string;
  publishedAt: string;
  dbVersion: string;
  palCount: number;
  comboCount: number;
  trending: number[];
  features: {
    worldTreeNote?: string;
  };
  gameTarget: {
    minimum: string;
    preferred: string;
    alignmentNote: string;
  };
  note: string;
  urls: {
    release: string;
    db: string;
    breeding: string;
  };
  terrariaCount?: number;
  worldTreeLockedCount?: number;
  worldTreeBreedableCount?: number;
}

export interface BreedingDataset {
  meta: DatasetMeta;
  pals: Pal[];
  combos: Combo[];
  byChild: number[][];
  byParent: number[][];
  specialGenders: SpecialGenderCombo[];
  mutationPassives: MutationPassive[];
  minSteps: number[][];
  byInternalName: Map<string, Pal>;
  byName: Map<string, Pal>;
  pairToChild: Map<string, number>;
}
