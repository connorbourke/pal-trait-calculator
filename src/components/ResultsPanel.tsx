import { useMemo, useState } from "react";
import type { Mode, MutationPassive, Pal } from "../lib/types";
import type { ParentPair } from "../lib/breeding";
import type { OwnedBreedResult, PathResult, PathStep } from "../lib/path";
import { formatWork } from "../lib/breeding";
import { PalPortrait } from "./PalPortrait";

interface Props {
  mode: Mode;
  target: Pal | null;
  parentA: Pal | null;
  parentB: Pal | null;
  pathStart: Pal | null;
  pathTarget: Pal | null;
  pathTraitA: Pal | null;
  pathTraitB: Pal | null;
  pathPlannerMode: "chain" | "merge";
  waypoints: Pal[];
  child: Pal | null;
  pairs: ParentPair[];
  path: PathResult | null;
  ownedResult: OwnedBreedResult | null;
  browsePals: Pal[];
  owned: Set<number>;
  mutationPassives: MutationPassive[];
  mutationNote: string;
  onToggleOwned: (index: number) => void;
}

export function ResultsPanel(props: Props) {
  switch (props.mode) {
    case "parents":
      return <ParentsResults {...props} />;
    case "child":
      return <ChildResults {...props} />;
    case "path":
      return <PathResults {...props} />;
    case "owned":
      return <OwnedResults {...props} />;
    case "browse":
      return <BrowseResults {...props} />;
  }
}

function pairMatchesQuery(pair: ParentPair, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const tokens = q.split(/[\s,+]+/).filter(Boolean);
  if (tokens.length === 0) return true;

  // Only match visible labels (name / Paldeck #) — not internal game IDs,
  // which caused false hits like "shroom" matching Mycora (MushroomLady).
  const haystacks = [pair.parentA, pair.parentB].map((pal) =>
    [pal.name, pal.dex, String(pal.dexNo)].join(" ").toLowerCase(),
  );

  return tokens.every((token) =>
    haystacks.some((hay) => hay.includes(token)),
  );
}

function ParentsResults({ target, pairs, owned }: Props) {
  const [resultsQuery, setResultsQuery] = useState("");

  const filteredPairs = useMemo(
    () => pairs.filter((pair) => pairMatchesQuery(pair, resultsQuery)),
    [pairs, resultsQuery],
  );

  // Reset filter when the target changes
  const targetKey = target?.index ?? -1;
  const [prevTarget, setPrevTarget] = useState(targetKey);
  if (prevTarget !== targetKey) {
    setPrevTarget(targetKey);
    if (resultsQuery) setResultsQuery("");
  }

  if (!target) {
    return (
      <section className="results">
        <h2>Parent combinations</h2>
        <p className="quiet">Select a target Pal to see its parent pairs.</p>
      </section>
    );
  }

  return (
    <section className="results">
      <div className="results-head">
        <div className="results-target">
          <PalPortrait pal={target} size="lg" layout="row" />
          <div>
            <h2>Parent combinations</h2>
            <p className="count">
              {filteredPairs.length.toLocaleString()}
              {resultsQuery.trim()
                ? ` of ${pairs.length.toLocaleString()}`
                : ""}{" "}
              pairs
            </p>
          </div>
        </div>
      </div>

      {pairs.length > 0 ? (
        <label className="results-search">
          <span>Search results</span>
          <input
            type="search"
            value={resultsQuery}
            onChange={(e) => setResultsQuery(e.target.value)}
            placeholder="Filter by parent name or Paldeck #…"
            autoComplete="off"
          />
        </label>
      ) : null}

      {owned.size > 0 ? (
        <p className="hint-inline">
          Pairs you already own are highlighted and sorted first.
        </p>
      ) : null}

      {pairs.length === 0 ? (
        <p className="quiet">No parent pairs found for this Pal.</p>
      ) : filteredPairs.length === 0 ? (
        <p className="quiet">
          No pairs match “{resultsQuery.trim()}”. Try another name or Paldeck
          number.
        </p>
      ) : (
        <ul className="pair-list">
          {filteredPairs.map((pair) => {
            const bothOwned =
              owned.has(pair.parentA.index) && owned.has(pair.parentB.index);
            return (
              <li key={pair.comboIndex}>
                <div className={`pair${bothOwned ? " pair-owned" : ""}`}>
                  <PalPortrait
                    pal={pair.parentA}
                    size="md"
                    layout="row"
                    owned={owned.has(pair.parentA.index)}
                  />
                  <span className="plus" aria-hidden="true">
                    +
                  </span>
                  <PalPortrait
                    pal={pair.parentB}
                    size="md"
                    layout="row"
                    owned={owned.has(pair.parentB.index)}
                  />
                  {pair.sameSpecies ? (
                    <span className="badge">Same species</span>
                  ) : null}
                  {bothOwned ? (
                    <span className="badge owned-badge">Owned</span>
                  ) : null}
                </div>
                {pair.genderNote ? (
                  <p className="gender-note">{pair.genderNote}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ChildResults({
  parentA,
  parentB,
  child,
  mutationPassives,
  mutationNote,
}: Props) {
  if (!parentA || !parentB) {
    return (
      <section className="results">
        <h2>Offspring</h2>
        <p className="quiet">
          Choose Parent A and Parent B to see their child. Leave one empty to
          scan every child that parent can produce.
        </p>
      </section>
    );
  }

  if (!child) {
    return (
      <section className="results">
        <h2>Offspring</h2>
        <p className="quiet">No combo found for that pair in the dump.</p>
      </section>
    );
  }

  return (
    <section className="results">
      <h2>Offspring</h2>
      <article className="child-card">
        <div className="child-equation">
          <PalPortrait pal={parentA} size="md" layout="row" />
          <span className="plus">+</span>
          <PalPortrait pal={parentB} size="md" layout="row" />
          <span className="plus">→</span>
          <PalPortrait pal={child} size="lg" layout="row" />
        </div>
      </article>

      <article className="mutation-card">
        <h3>Mutation overlay</h3>
        <p>{mutationNote}</p>
        <p className="quiet">
          If this egg mutates, the species stays <strong>{child.name}</strong>.
          Mutated hatchlings can roll these unique passives:
        </p>
        <ul className="mutation-list">
          {mutationPassives.map((passive) => (
            <li key={passive.internalName}>
              <strong>{passive.name}</strong>
              <span>{passive.description}</span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

function PathResults({
  pathStart,
  pathTarget,
  pathTraitA,
  pathTraitB,
  pathPlannerMode,
  waypoints,
  path,
}: Props) {
  const ready =
    pathPlannerMode === "chain"
      ? Boolean(pathStart && pathTarget)
      : Boolean(pathTraitA && pathTraitB && pathTarget);

  if (!ready) {
    return (
      <section className="results">
        <h2>Trait path planner</h2>
        <p className="quiet">
          {pathPlannerMode === "chain"
            ? "Pick a start Pal and target. Optionally add waypoints that the chain must pass through."
            : "Pick two trait parents and a target. The planner merges both lineages into one tree."}
        </p>
      </section>
    );
  }

  if (!path) return null;

  if (path.unreachable && path.steps.length === 0) {
    return (
      <section className="results">
        <h2>Trait path planner</h2>
        <p className="quiet">
          {path.summary ?? "No breeding route found for that setup."}
        </p>
      </section>
    );
  }

  const branchA = path.steps.filter((s) => s.role === "branch-a");
  const branchB = path.steps.filter((s) => s.role === "branch-b");
  const mergeSteps = path.steps.filter((s) => s.role === "merge");
  const finishSteps = path.steps.filter((s) => s.role === "finish");

  return (
    <section className="results">
      <div className="results-head">
        <div className="results-target">
          {pathPlannerMode === "chain" && pathStart ? (
            <>
              <PalPortrait pal={pathStart} size="md" layout="row" />
              {waypoints.map((w) => (
                <span key={w.index} className="path-inline">
                  <span className="plus">→</span>
                  <PalPortrait pal={w} size="sm" layout="row" />
                </span>
              ))}
              <span className="plus">→</span>
              {pathTarget ? (
                <PalPortrait pal={pathTarget} size="md" layout="row" />
              ) : null}
            </>
          ) : (
            <>
              {pathTraitA ? (
                <PalPortrait pal={pathTraitA} size="md" layout="row" />
              ) : null}
              <span className="plus">+</span>
              {pathTraitB ? (
                <PalPortrait pal={pathTraitB} size="md" layout="row" />
              ) : null}
              <span className="plus">→</span>
              {pathTarget ? (
                <PalPortrait pal={pathTarget} size="md" layout="row" />
              ) : null}
            </>
          )}
        </div>
        <p className="count">
          {path.totalBreeds} breed{path.totalBreeds === 1 ? "" : "s"}
          {path.unreachable ? " · partial" : ""}
        </p>
      </div>

      {path.summary ? <p className="hint-inline">{path.summary}</p> : null}
      <p className="quiet">
        Species-level plan for trait routing — passives/IVs are not simulated.
      </p>

      {path.steps.length === 0 ? (
        <p className="quiet">Already at the target — no breeds needed.</p>
      ) : pathPlannerMode === "merge" ? (
        <div className="tree-sections">
          <PathSection title="Branch A — from trait parent A" steps={branchA} />
          <PathSection title="Branch B — from trait parent B" steps={branchB} />
          <PathSection title="Merge — combine the two branches" steps={mergeSteps} />
          <PathSection title="Finish — to target" steps={finishSteps} />
        </div>
      ) : (
        <PathSection title="Breeding steps" steps={path.steps} />
      )}
    </section>
  );
}

function PathSection({ title, steps }: { title: string; steps: PathStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="wave">
      <h3>{title}</h3>
      <ol className="path-list">
        {steps.map((step, index) => (
          <li key={`${step.role}-${step.from.index}-${step.partner.index}-${step.child.index}-${index}`}>
            <span className="step-num">{index + 1}</span>
            <div className={`pair${step.role === "merge" ? " pair-owned" : ""}`}>
              <PalPortrait pal={step.from} size="md" layout="row" />
              <span className="plus">+</span>
              <PalPortrait pal={step.partner} size="md" layout="row" />
              <span className="plus">→</span>
              <PalPortrait pal={step.child} size="md" layout="row" />
              {step.role === "merge" ? (
                <span className="badge owned-badge">Merge</span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OwnedResults({ ownedResult, owned, onToggleOwned }: Props) {
  if (!ownedResult || owned.size === 0) {
    return (
      <section className="results">
        <h2>Multi-pal breeder</h2>
        <p className="quiet">
          Select Pals you own above, then see what first / second / third breed
          waves unlock and what is still missing.
        </p>
      </section>
    );
  }

  return (
    <section className="results">
      <div className="results-head">
        <h2>Multi-pal breeder</h2>
        <p className="count">{owned.size} owned</p>
      </div>

      <div className="owned-selected">
        {ownedResult.owned.map((pal) => (
          <button
            key={pal.index}
            type="button"
            className="trend-chip owned-chip"
            onClick={() => onToggleOwned(pal.index)}
            title="Remove"
          >
            <PalPortrait pal={pal} size="sm" layout="row" />
            <span className="remove-x" aria-hidden="true">
              ×
            </span>
          </button>
        ))}
      </div>

      {ownedResult.waves.map((wave) => (
        <div key={wave.generation} className="wave">
          <h3>
            {wave.generation === 1
              ? "First breed"
              : wave.generation === 2
                ? "Second breed"
                : "Third breed"}{" "}
            <span className="count">({wave.pals.length})</span>
          </h3>
          {wave.pals.length === 0 ? (
            <p className="quiet">Nothing new this generation.</p>
          ) : (
            <ul className="browse-grid compact">
              {wave.pals.map((pal) => (
                <li key={pal.index}>
                  <PalPortrait pal={pal} size="md" layout="row" />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="wave">
        <h3>
          Missing pals{" "}
          <span className="count">({ownedResult.missing.length})</span>
        </h3>
        <ul className="browse-grid compact">
          {ownedResult.missing.slice(0, 60).map((pal) => (
            <li key={pal.index}>
              <PalPortrait pal={pal} size="md" layout="row" />
            </li>
          ))}
        </ul>
        {ownedResult.missing.length > 60 ? (
          <p className="quiet">
            Showing 60 of {ownedResult.missing.length}.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function BrowseResults({ browsePals, owned, onToggleOwned }: Props) {
  return (
    <section className="results">
      <div className="results-head">
        <h2>Browse all Pals</h2>
        <p className="count">{browsePals.length} shown</p>
      </div>
      <p className="hint-inline">
        Click a Pal to toggle it in your owned set (saved locally).
      </p>
      <ul className="browse-list">
        {browsePals.map((pal) => {
          const isOwned = owned.has(pal.index);
          return (
            <li key={pal.index}>
              <button
                type="button"
                className={`browse-row${isOwned ? " owned" : ""}`}
                onClick={() => onToggleOwned(pal.index)}
              >
                <PalPortrait pal={pal} size="md" layout="row" showMeta />
                <span className="work">
                  {pal.work.length === 0
                    ? "—"
                    : pal.work
                        .slice(0, 3)
                        .map((w) => `${formatWork(w.work)} ${w.level}`)
                        .join(" · ")}
                </span>
                <span className="own-flag">{isOwned ? "Owned" : "Add"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
