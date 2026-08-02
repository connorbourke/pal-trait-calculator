import type { ThemeId } from "../lib/theme";

interface Props {
  theme: ThemeId;
  onChange: (theme: ThemeId) => void;
}

const OPTIONS: { id: ThemeId; label: string; hint: string }[] = [
  { id: "eidrolon", label: "Eidrolon", hint: "Night" },
  { id: "sekhmet", label: "Sekhmet", hint: "Day" },
];

export function ThemeToggle({ theme, onChange }: Props) {
  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="Color theme"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={theme === option.id ? "active" : undefined}
          aria-pressed={theme === option.id}
          title={`${option.label} (${option.hint})`}
          onClick={() => onChange(option.id)}
        >
          <span className="theme-toggle-name">{option.label}</span>
          <span className="theme-toggle-hint">{option.hint}</span>
        </button>
      ))}
    </div>
  );
}
