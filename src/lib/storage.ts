const OWNED_KEY = "pal-breeding.owned";
const HIDE_TERRARIA_KEY = "pal-breeding.hideTerraria";

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
