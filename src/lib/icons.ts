import type { Pal } from "./types";

const ICON_BASE =
  "https://cdn.jsdelivr.net/gh/tylercamp/palcalc@v1.19.1/PalCalc.UI/Resources/Pals";

export function palIconUrl(pal: Pick<Pal, "name">): string {
  return `${ICON_BASE}/${encodeURIComponent(pal.name)}.png`;
}
