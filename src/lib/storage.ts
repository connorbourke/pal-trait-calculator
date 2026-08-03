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

const PET_POS_KEY = "pal-trait-calculator.petPos";

export type PetPosition = { x: number; y: number };

export function loadPetPositions(): Partial<
  Record<"eidrolon" | "sekhmet", PetPosition>
> {
  try {
    const raw = localStorage.getItem(PET_POS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<Record<"eidrolon" | "sekhmet", PetPosition>> = {};
    for (const key of ["eidrolon", "sekhmet"] as const) {
      const row = (parsed as Record<string, unknown>)[key];
      if (
        row &&
        typeof row === "object" &&
        typeof (row as PetPosition).x === "number" &&
        typeof (row as PetPosition).y === "number"
      ) {
        out[key] = { x: (row as PetPosition).x, y: (row as PetPosition).y };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function savePetPosition(
  theme: "eidrolon" | "sekhmet",
  pos: PetPosition,
): void {
  const all = loadPetPositions();
  all[theme] = pos;
  localStorage.setItem(PET_POS_KEY, JSON.stringify(all));
}
