import { useState } from "react";
import { palIconUrl } from "../lib/icons";
import type { Pal } from "../lib/types";

interface Props {
  pal: Pal;
  size?: "sm" | "md" | "lg";
  owned?: boolean;
  showMeta?: boolean;
  layout?: "stack" | "row";
}

export function PalPortrait({
  pal,
  size = "md",
  owned = false,
  showMeta = false,
  layout = "stack",
}: Props) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`pal-portrait size-${size} layout-${layout}${owned ? " owned" : ""}`}
    >
      <div className="pal-portrait-art" aria-hidden={failed ? undefined : true}>
        {failed ? (
          <span className="pal-portrait-fallback">{pal.name.slice(0, 2)}</span>
        ) : (
          <img
            src={palIconUrl(pal)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="pal-portrait-text">
        <span className="dex">#{pal.dex}</span>
        <span className="name">{pal.name}</span>
        {showMeta ? (
          <span className="meta">
            R{pal.rarity}
            {pal.isTerraria ? " · Terraria" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
