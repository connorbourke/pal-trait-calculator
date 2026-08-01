import { PalPortrait } from "./PalPortrait";
import type { Pal } from "../lib/types";

interface Props {
  pals: Pal[];
  onPick: (pal: Pal) => void;
}

export function TrendingPals({ pals, onPick }: Props) {
  if (pals.length === 0) return null;
  return (
    <div className="trending">
      <p className="trending-label">Trending Pals</p>
      <div className="trending-row">
        {pals.map((pal) => (
          <button
            key={pal.index}
            type="button"
            className="trend-chip"
            onClick={() => onPick(pal)}
          >
            <PalPortrait pal={pal} size="sm" layout="row" />
          </button>
        ))}
      </div>
    </div>
  );
}
