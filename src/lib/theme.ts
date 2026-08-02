export type ThemeId = "eidrolon" | "sekhmet";

const THEME_KEY = "pal-trait-calculator.theme";

export function isThemeId(value: unknown): value is ThemeId {
  return value === "eidrolon" || value === "sekhmet";
}

export function themeFromSystem(): ThemeId {
  if (typeof window === "undefined") return "eidrolon";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "sekhmet"
    : "eidrolon";
}

export function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (isThemeId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return themeFromSystem();
}

export function saveTheme(theme: ThemeId): void {
  localStorage.setItem(THEME_KEY, theme);
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
}
