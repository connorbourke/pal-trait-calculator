import { useEffect, useId, useRef } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { pathStepKey, type SavedPathPlan } from "../lib/savedPaths";
import type { ThemeId } from "../lib/theme";

interface Props {
  open: boolean;
  onClose: () => void;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  showPet: boolean;
  onShowPetChange: (show: boolean) => void;
  savedPlans: SavedPathPlan[];
  activeSavedPlanId: string | null;
  onOpenSavedPlan: (plan: SavedPathPlan) => void;
  onDeleteSavedPlan: (id: string) => void;
}

export function SettingsDrawer({
  open,
  onClose,
  theme,
  onThemeChange,
  showPet,
  onShowPetChange,
  savedPlans,
  activeSavedPlanId,
  onOpenSavedPlan,
  onDeleteSavedPlan,
}: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-drawer" role="presentation">
      <button
        type="button"
        className="settings-drawer-backdrop"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        className="settings-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="settings-drawer-header">
          <h2 id={titleId} className="settings-drawer-title">
            Settings
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="settings-drawer-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="settings-drawer-body">
          <section className="settings-section" aria-labelledby="settings-appearance">
            <h3 id="settings-appearance" className="settings-section-title">
              Appearance
            </h3>
            <ThemeToggle theme={theme} onChange={onThemeChange} />
          </section>

          <section className="settings-section" aria-labelledby="settings-pet">
            <h3 id="settings-pet" className="settings-section-title">
              Pet
            </h3>
            <label className="check">
              <input
                type="checkbox"
                checked={showPet}
                onChange={(e) => onShowPetChange(e.target.checked)}
              />
              Show theme pet
            </label>
            <p className="settings-hint">
              Decorative sprite in the corner. Handy to hide on small screens.
            </p>
          </section>

          <section className="settings-section" aria-labelledby="settings-plans">
            <h3 id="settings-plans" className="settings-section-title">
              Saved plans
            </h3>
            {savedPlans.length === 0 ? (
              <p className="settings-hint">
                Save a Trait Path tree or route from the results, then reopen it
                here later.
              </p>
            ) : (
              <ul className="saved-plans-list">
                {savedPlans.map((plan) => {
                  const total = plan.result.steps.length;
                  const done = plan.completedStepKeys.filter((key) =>
                    plan.result.steps.some((step) => pathStepKey(step) === key),
                  ).length;
                  const active = plan.id === activeSavedPlanId;
                  return (
                    <li
                      key={plan.id}
                      className={
                        active ? "saved-plan-item active" : "saved-plan-item"
                      }
                    >
                      <div className="saved-plan-meta">
                        <strong>{plan.name}</strong>
                        <span>
                          {plan.plannerMode === "merge" ? "Merge" : "Route"} ·{" "}
                          {done}/{total} steps
                        </span>
                      </div>
                      <div className="saved-plan-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            onOpenSavedPlan(plan);
                            onClose();
                          }}
                        >
                          {active ? "Viewing" : "Open"}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => onDeleteSavedPlan(plan.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function SettingsGearButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="settings-gear"
      aria-label="Settings"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <GearIcon />
    </button>
  );
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
