import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  loadPetPositions,
  savePetPosition,
  type PetPosition,
} from "../lib/storage";
import type { ThemeId } from "../lib/theme";

const PET_SRC: Record<ThemeId, string> = {
  eidrolon: "/pets/eidrolon.png",
  sekhmet: "/pets/sekhmet.png",
};

const PET_SIZE_MOBILE = 96;
const PET_SIZE_DESKTOP = 144;
const DESKTOP_MQ = "(min-width: 640px)";
const MARGIN = 12;

function petSize(): number {
  if (typeof window === "undefined") return PET_SIZE_MOBILE;
  return window.matchMedia(DESKTOP_MQ).matches
    ? PET_SIZE_DESKTOP
    : PET_SIZE_MOBILE;
}

function defaultPos(): PetPosition {
  if (typeof window === "undefined") {
    return { x: MARGIN, y: MARGIN };
  }
  const size = petSize();
  return {
    x: Math.max(MARGIN, window.innerWidth - size - MARGIN * 2),
    y: Math.max(MARGIN, window.innerHeight - size - MARGIN * 2),
  };
}

function clampPos(pos: PetPosition): PetPosition {
  const size = petSize();
  const maxX = Math.max(MARGIN, window.innerWidth - size - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - size - MARGIN);
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
    const saved = loadPetPositions()[theme];
    return saved ? clampPos(saved) : defaultPos();
  });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    const saved = loadPetPositions()[theme];
    setPos(saved ? clampPos(saved) : defaultPos());
  }, [theme]);

  useEffect(() => {
    function onResize() {
      setPos((prev) => clampPos(prev));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
        clampPos({
          x: event.clientX - dragOffset.current.x,
          y: event.clientY - dragOffset.current.y,
        }),
      );
    },
    [dragging],
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
      savePetPosition(theme, posRef.current);
    },
    [dragging, theme],
  );

  return (
    <div
      className={`theme-pet${dragging ? " dragging" : ""}`}
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
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
