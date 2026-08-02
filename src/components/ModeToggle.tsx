import type { Mode } from "../lib/types";

const MODES: { id: Mode; label: string; title: string }[] = [
  { id: "path", label: "Trait Path", title: "Route traits through waypoints or merge two parents" },
  { id: "parents", label: "Find the Parents", title: "Find parent combinations" },
  { id: "child", label: "Find the Child", title: "Find offspring from two parents" },
  { id: "owned", label: "Multi-Pal", title: "Multi-pal owned breeder" },
  { id: "browse", label: "Browse", title: "Browse all Pals" },
];

interface Props {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="mode-toggle" role="tablist" aria-label="Search mode">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          title={item.title}
          aria-label={item.title}
          aria-selected={mode === item.id}
          className={mode === item.id ? "active" : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
