import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  loadPetPosition,
  savePetPosition,
  type PetPosition,
} from "../lib/storage";
import type { ThemeId } from "../lib/theme";

const PET_SRC: Record<ThemeId, string> = {
  eidrolon: "/pets/eidrolon.png",
  sekhmet: "/pets/sekhmet.png",
};

/**
 * Native sprite layout (pixels in the PNG).
 * Eidrolon bodyH = head-crown → feet (excludes horns above, wings, tail below).
 * Sekhmet body fills the square canvas.
 */
const PET_LAYOUT = {
  sekhmet: { nativeW: 96, nativeH: 96, bodyH: 96 },
  eidrolon: { nativeW: 71, nativeH: 96, bodyH: 61 },
} as const;

/** Sekhmet is ~10% smaller than the reference pet size. */
const SEKHMET_SCALE = 0.9;

const PET_H_MOBILE = 96;
const PET_H_DESKTOP = 144;
const DESKTOP_MQ = "(min-width: 640px)";
const MARGIN = 12;

function referenceHeight(): number {
  if (typeof window === "undefined") return PET_H_MOBILE;
  return window.matchMedia(DESKTOP_MQ).matches
    ? PET_H_DESKTOP
    : PET_H_MOBILE;
}

/**
 * Sekhmet: 90% of reference, square.
 * Eidrolon: scale so head→toe body height matches Sekhmet's height; wings/tail make the box taller & wider.
 */
function petBox(theme: ThemeId): { w: number; h: number } {
  const sekhmetH = Math.round(referenceHeight() * SEKHMET_SCALE);
  if (theme === "sekhmet") {
    return { w: sekhmetH, h: sekhmetH };
  }
  const { nativeW, nativeH, bodyH } = PET_LAYOUT.eidrolon;
  const scale = sekhmetH / bodyH;
  return {
    w: Math.round(nativeW * scale),
    h: Math.round(nativeH * scale),
  };
}

function defaultPos(theme: ThemeId): PetPosition {
  if (typeof window === "undefined") {
    return { x: MARGIN, y: MARGIN };
  }
  const { w, h } = petBox(theme);
  return {
    x: Math.max(MARGIN, window.innerWidth - w - MARGIN * 2),
    y: Math.max(MARGIN, window.innerHeight - h - MARGIN * 2),
  };
}

function clampPos(pos: PetPosition, theme: ThemeId): PetPosition {
  const { w, h } = petBox(theme);
  const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
  return {
    x: Math.min(maxX, Math.max(MARGIN, pos.x)),
    y: Math.min(maxY, Math.max(MARGIN, pos.y)),
  };
}

interface Props {
  theme: ThemeId;
}

export function ThemePet({ theme }: Props) {
  const [pos, setPos] = useState<PetPosition>(() => {
    const saved = loadPetPosition();
    return saved ? clampPos(saved, theme) : defaultPos(theme);
  });
  const [dragging, setDragging] = useState(false);
  const [box, setBox] = useState(() => petBox(theme));
  const dragOffset = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;

  // Theme only swaps art/size — keep the same shared position (re-clamp for box).
  useEffect(() => {
    setBox(petBox(theme));
    setPos((prev) => clampPos(prev, theme));
  }, [theme]);

  useEffect(() => {
    function onResize() {
      setBox(petBox(theme));
      setPos((prev) => clampPos(prev, theme));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [theme]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragOffset.current = {
        x: event.clientX - posRef.current.x,
        y: event.clientY - posRef.current.y,
      };
      setDragging(true);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      setPos(
        clampPos(
          {
            x: event.clientX - dragOffset.current.x,
            y: event.clientY - dragOffset.current.y,
          },
          theme,
        ),
      );
    },
    [dragging, theme],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      setDragging(false);
      savePetPosition(posRef.current);
    },
    [dragging],
  );

  return (
    <div
      className={`theme-pet${dragging ? " dragging" : ""}`}
      style={{
        width: box.w,
        height: box.h,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
      }}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="theme-pet-sprite">
        <img src={PET_SRC[theme]} alt="" draggable={false} />
      </div>
    </div>
  );
}
