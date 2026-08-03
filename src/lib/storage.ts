const OWNED_KEY = "pal-trait-calculator.owned";
const HIDE_TERRARIA_KEY = "pal-trait-calculator.hideTerraria";
const HIDE_WT_LOCKED_KEY = "pal-trait-calculator.hideWorldTreeLocked";
const HIDE_WT_BREEDABLE_KEY = "pal-trait-calculator.hideWorldTreeBreedable";

export function loadOwned(): number[] {
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return [];
  }
}

export function saveOwned(indexes: number[]): void {
  localStorage.setItem(
    OWNED_KEY,
    JSON.stringify([...new Set(indexes)].sort((a, b) => a - b)),
  );
}

export function loadHideTerraria(): boolean {
  return localStorage.getItem(HIDE_TERRARIA_KEY) === "1";
}

export function saveHideTerraria(value: boolean): void {
  localStorage.setItem(HIDE_TERRARIA_KEY, value ? "1" : "0");
}

/** Default on: most users lack World Tree access. */
export function loadHideWorldTreeLocked(): boolean {
  const raw = localStorage.getItem(HIDE_WT_LOCKED_KEY);
  if (raw === null) return true;
  return raw === "1";
}

export function saveHideWorldTreeLocked(value: boolean): void {
  localStorage.setItem(HIDE_WT_LOCKED_KEY, value ? "1" : "0");
}

/** Default off: these are breedable before World Tree. */
export function loadHideWorldTreeBreedable(): boolean {
  return localStorage.getItem(HIDE_WT_BREEDABLE_KEY) === "1";
}

export function saveHideWorldTreeBreedable(value: boolean): void {
  localStorage.setItem(HIDE_WT_BREEDABLE_KEY, value ? "1" : "0");
}

const SHOW_PET_KEY = "pal-trait-calculator.showPet";

/** Default on: decorative pet is part of the theme. */
export function loadShowPet(): boolean {
  const raw = localStorage.getItem(SHOW_PET_KEY);
  if (raw === null) return true;
  return raw === "1";
}

export function saveShowPet(value: boolean): void {
  localStorage.setItem(SHOW_PET_KEY, value ? "1" : "0");
}

const PET_POS_KEY = "pal-trait-calculator.petPos";

export type PetPosition = { x: number; y: number };

function isPetPosition(value: unknown): value is PetPosition {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as PetPosition).x === "number" &&
    typeof (value as PetPosition).y === "number"
  );
}

/** Shared pet position across themes (one sprite slot, theme only swaps art). */
export function loadPetPosition(): PetPosition | null {
  try {
    const raw = localStorage.getItem(PET_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    // Current format: { x, y }
    if (isPetPosition(parsed) && !("eidrolon" in parsed) && !("sekhmet" in parsed)) {
      return { x: parsed.x, y: parsed.y };
    }
    // Legacy per-theme map — reuse whichever was saved
    const legacy = parsed as Record<string, unknown>;
    for (const key of ["eidrolon", "sekhmet"] as const) {
      if (isPetPosition(legacy[key])) {
        return { x: legacy[key].x, y: legacy[key].y };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function savePetPosition(pos: PetPosition): void {
  localStorage.setItem(PET_POS_KEY, JSON.stringify(pos));
}
