import { useEffect, useMemo, useState } from "react";
import { ModeToggle } from "./components/ModeToggle";
import { PalPortrait } from "./components/PalPortrait";
import { PalSelect } from "./components/PalSelect";
import { ResultsPanel } from "./components/ResultsPanel";
import { TrendingPals } from "./components/TrendingPals";
import {
  childrenFromParent,
  filterPals,
  findChild,
  findParents,
  isPalFiltered,
  loadDataset,
} from "./lib/breeding";
import {
  buildMergeTree,
  filterChainCandidatesByPairingSearch,
  filterMergeCandidatesByPairingSearch,
  findChainCandidates,
  findMergeCandidates,
  multiPalBreeder,
  type MergeCandidate,
  type PathResult,
} from "./lib/path";
import {
  loadHideTerraria,
  loadHideWorldTreeBreedable,
  loadHideWorldTreeLocked,
  loadOwned,
  saveHideTerraria,
  saveHideWorldTreeBreedable,
  saveHideWorldTreeLocked,
  saveOwned,
} from "./lib/storage";
import type { BreedingDataset, Mode, Pal } from "./lib/types";

type PathPlannerMode = "chain" | "merge";

const MERGE_PAGE_SIZE = 5;

export default function App() {
  const [dataset, setDataset] = useState<BreedingDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("path");
  const [hideTerraria, setHideTerraria] = useState(true);
  const [hideWorldTreeLocked, setHideWorldTreeLocked] = useState(true);
  const [hideWorldTreeBreedable, setHideWorldTreeBreedable] = useState(false);
  const [includeTargetAsParent, setIncludeTargetAsParent] = useState(false);
  const [owned, setOwned] = useState<number[]>([]);
  const [browseQuery, setBrowseQuery] = useState("");
  const [target, setTarget] = useState<Pal | null>(null);
  const [parentA, setParentA] = useState<Pal | null>(null);
  const [parentB, setParentB] = useState<Pal | null>(null);
  const [pathPlannerMode, setPathPlannerMode] =
    useState<PathPlannerMode>("merge");
  const [pathStart, setPathStart] = useState<Pal | null>(null);
  const [pathTarget, setPathTarget] = useState<Pal | null>(null);
  const [pathTraitA, setPathTraitA] = useState<Pal | null>(null);
  const [pathTraitB, setPathTraitB] = useState<Pal | null>(null);
  const [waypoints, setWaypoints] = useState<Pal[]>([]);
  const [waypointPicker, setWaypointPicker] = useState<Pal | null>(null);
  const [ownedPicker, setOwnedPicker] = useState<Pal | null>(null);
  const [pathVisibleCount, setPathVisibleCount] = useState(MERGE_PAGE_SIZE);
  const [pathPairTags, setPathPairTags] = useState<Pal[]>([]);
  const [pathExcludeTags, setPathExcludeTags] = useState<Pal[]>([]);
  const [pathIncludePicker, setPathIncludePicker] = useState<Pal | null>(null);
  const [pathExcludePicker, setPathExcludePicker] = useState<Pal | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDataset()
      .then((data) => {
        if (cancelled) return;
        setDataset(data);
        setHideTerraria(loadHideTerraria());
        setHideWorldTreeLocked(loadHideWorldTreeLocked());
        setHideWorldTreeBreedable(loadHideWorldTreeBreedable());
        setOwned(loadOwned());
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ownedSet = useMemo(() => new Set(owned), [owned]);

  const filterOptions = useMemo(
    () => ({
      hideTerraria,
      hideWorldTreeLocked,
      hideWorldTreeBreedable,
    }),
    [hideTerraria, hideWorldTreeLocked, hideWorldTreeBreedable],
  );

  const selectablePals = useMemo(() => {
    if (!dataset) return [];
    return filterPals(dataset.pals, filterOptions);
  }, [dataset, filterOptions]);

  const trending = useMemo(() => {
    if (!dataset) return [];
    return dataset.meta.trending
      .map((index) => dataset.pals[index])
      .filter((p) => p && !isPalFiltered(p, filterOptions));
  }, [dataset, filterOptions]);

  const parentPairs = useMemo(() => {
    if (!dataset || target == null || mode !== "parents") return [];
    return findParents(dataset, target.index, {
      ...filterOptions,
      owned: ownedSet,
    });
  }, [dataset, target, mode, filterOptions, ownedSet]);

  const childResult = useMemo(() => {
    if (!dataset || parentA == null || parentB == null || mode !== "child") {
      return null;
    }
    return findChild(dataset, parentA.index, parentB.index);
  }, [dataset, parentA, parentB, mode]);

  const singleParentChildren = useMemo(() => {
    if (!dataset || mode !== "child") return [];
    if (parentA && !parentB) {
      return childrenFromParent(dataset, parentA.index, filterOptions);
    }
    if (parentB && !parentA) {
      return childrenFromParent(dataset, parentB.index, filterOptions);
    }
    return [];
  }, [dataset, mode, parentA, parentB, filterOptions]);

  const pathOptions = useMemo(
    () => ({ ...filterOptions, includeTargetAsParent }),
    [filterOptions, includeTargetAsParent],
  );

  const mergeCandidates = useMemo((): MergeCandidate[] => {
    if (
      !dataset ||
      mode !== "path" ||
      pathPlannerMode !== "merge" ||
      !pathTraitA ||
      !pathTraitB ||
      !pathTarget
    ) {
      return [];
    }
    return findMergeCandidates(
      dataset,
      pathTraitA.index,
      pathTraitB.index,
      pathTarget.index,
      pathOptions,
    );
  }, [
    dataset,
    mode,
    pathPlannerMode,
    pathTraitA,
    pathTraitB,
    pathTarget,
    pathOptions,
  ]);

  const waypointKey = waypoints.map((w) => w.index).join(",");

  useEffect(() => {
    setPathVisibleCount(MERGE_PAGE_SIZE);
    setPathPairTags([]);
    setPathExcludeTags([]);
    setPathIncludePicker(null);
    setPathExcludePicker(null);
  }, [
    pathTraitA?.index,
    pathTraitB?.index,
    pathStart?.index,
    pathTarget?.index,
    pathPlannerMode,
    hideTerraria,
    hideWorldTreeLocked,
    hideWorldTreeBreedable,
    includeTargetAsParent,
    waypointKey,
  ]);

  const pathIncludeIndexes = useMemo(
    () => pathPairTags.map((pal) => pal.index),
    [pathPairTags],
  );

  const pathExcludeIndexes = useMemo(
    () => pathExcludeTags.map((pal) => pal.index),
    [pathExcludeTags],
  );

  const filteredMergeCandidates = useMemo((): MergeCandidate[] => {
    if (!dataset || !pathTraitA || !pathTraitB || !pathTarget) {
      return mergeCandidates;
    }
    if (pathIncludeIndexes.length === 0 && pathExcludeIndexes.length === 0) {
      return mergeCandidates;
    }
    return filterMergeCandidatesByPairingSearch(
      dataset,
      pathTraitA.index,
      pathTraitB.index,
      pathTarget.index,
      mergeCandidates,
      pathIncludeIndexes,
      pathExcludeIndexes,
      pathOptions,
    );
  }, [
    dataset,
    pathTraitA,
    pathTraitB,
    pathTarget,
    mergeCandidates,
    pathIncludeIndexes,
    pathExcludeIndexes,
    pathOptions,
  ]);

  const mergePaths = useMemo((): PathResult[] => {
    if (!dataset || !pathTraitA || !pathTraitB || !pathTarget) return [];
    return filteredMergeCandidates
      .slice(0, pathVisibleCount)
      .map((candidate) =>
        buildMergeTree(
          dataset,
          pathTraitA.index,
          pathTraitB.index,
          pathTarget.index,
          candidate,
          pathOptions,
        ),
      );
  }, [
    dataset,
    pathTraitA,
    pathTraitB,
    pathTarget,
    filteredMergeCandidates,
    pathVisibleCount,
    pathOptions,
  ]);

  const chainCandidates = useMemo((): PathResult[] => {
    if (
      !dataset ||
      mode !== "path" ||
      pathPlannerMode !== "chain" ||
      !pathStart ||
      !pathTarget
    ) {
      return [];
    }
    return findChainCandidates(
      dataset,
      pathStart.index,
      waypoints.map((w) => w.index),
      pathTarget.index,
      pathOptions,
    );
  }, [
    dataset,
    mode,
    pathPlannerMode,
    pathStart,
    pathTarget,
    waypoints,
    pathOptions,
  ]);

  const filteredChainCandidates = useMemo((): PathResult[] => {
    if (pathIncludeIndexes.length === 0 && pathExcludeIndexes.length === 0) {
      return chainCandidates;
    }
    return filterChainCandidatesByPairingSearch(
      chainCandidates,
      pathIncludeIndexes,
      pathExcludeIndexes,
    );
  }, [chainCandidates, pathIncludeIndexes, pathExcludeIndexes]);

  const chainPaths = useMemo(
    () => filteredChainCandidates.slice(0, pathVisibleCount),
    [filteredChainCandidates, pathVisibleCount],
  );

  useEffect(() => {
    setPathVisibleCount(MERGE_PAGE_SIZE);
  }, [pathIncludeIndexes, pathExcludeIndexes]);

  const pathResult = useMemo(() => {
    if (!dataset || mode !== "path" || !pathTarget) return null;

    if (pathPlannerMode === "chain") {
      if (!pathStart) return null;
      if (filteredChainCandidates.length === 0) {
        return {
          steps: [],
          totalBreeds: 10_000,
          unreachable: true,
          kind: "chain" as const,
          summary: "No breeding route found for that setup",
        };
      }
      return filteredChainCandidates[0] ?? null;
    }

    if (!pathTraitA || !pathTraitB) return null;
    if (mergeCandidates.length === 0) {
      return {
        steps: [],
        totalBreeds: 10_000,
        unreachable: true,
        kind: "merge" as const,
        summary: "No merge tree found that uses both parents",
      };
    }
    return mergePaths[0] ?? null;
  }, [
    dataset,
    mode,
    pathPlannerMode,
    pathStart,
    pathTarget,
    pathTraitA,
    pathTraitB,
    mergeCandidates,
    mergePaths,
    filteredChainCandidates,
  ]);

  const ownedResult = useMemo(() => {
    if (!dataset || mode !== "owned") return null;
    return multiPalBreeder(dataset, owned, { ...filterOptions, generations: 3 });
  }, [dataset, mode, owned, filterOptions]);

  const browsePals = useMemo(() => {
    if (!dataset || mode !== "browse") return [];
    return filterPals(dataset.pals, { ...filterOptions, query: browseQuery });
  }, [dataset, mode, filterOptions, browseQuery]);

  function updateHideTerraria(value: boolean) {
    setHideTerraria(value);
    saveHideTerraria(value);
  }

  function updateHideWorldTreeLocked(value: boolean) {
    setHideWorldTreeLocked(value);
    saveHideWorldTreeLocked(value);
  }

  function updateHideWorldTreeBreedable(value: boolean) {
    setHideWorldTreeBreedable(value);
    saveHideWorldTreeBreedable(value);
  }

  function toggleOwned(index: number) {
    setOwned((prev) => {
      const next = prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index];
      saveOwned(next);
      return next;
    });
  }

  function addWaypoint(pal: Pal) {
    setWaypoints((prev) => {
      if (prev.some((w) => w.index === pal.index)) return prev;
      if (pathStart?.index === pal.index || pathTarget?.index === pal.index) {
        return prev;
      }
      return [...prev, pal];
    });
  }

  function removeWaypoint(index: number) {
    setWaypoints((prev) => prev.filter((w) => w.index !== index));
  }

  function addPathPairTag(pal: Pal) {
    setPathPairTags((prev) => {
      if (prev.some((tag) => tag.index === pal.index)) return prev;
      return [...prev, pal];
    });
    setPathExcludeTags((prev) => prev.filter((tag) => tag.index !== pal.index));
  }

  function removePathPairTag(index: number) {
    setPathPairTags((prev) => prev.filter((tag) => tag.index !== index));
  }

  function addPathExcludeTag(pal: Pal) {
    setPathExcludeTags((prev) => {
      if (prev.some((tag) => tag.index === pal.index)) return prev;
      return [...prev, pal];
    });
    setPathPairTags((prev) => prev.filter((tag) => tag.index !== pal.index));
  }

  function removePathExcludeTag(index: number) {
    setPathExcludeTags((prev) => prev.filter((tag) => tag.index !== index));
  }

  function pickTrending(pal: Pal) {
    if (mode === "parents") setTarget(pal);
    else if (mode === "child") {
      if (!parentA) setParentA(pal);
      else if (!parentB) setParentB(pal);
      else setParentA(pal);
    } else if (mode === "path") {
      if (pathPlannerMode === "chain") {
        if (!pathStart) setPathStart(pal);
        else if (!pathTarget) setPathTarget(pal);
        else addWaypoint(pal);
      } else if (!pathTraitA) setPathTraitA(pal);
      else if (!pathTraitB) setPathTraitB(pal);
      else setPathTarget(pal);
    } else if (mode === "owned" || mode === "browse") {
      toggleOwned(pal.index);
    }
  }

  function swapParents() {
    setParentA(parentB);
    setParentB(parentA);
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />
      <header className="hero">
        <p className="brand">Pal Trait Calculator</p>
        <h1 className="headline">Find the pair. Hatch the Pal.</h1>
        <p className="lede">
          Plan trait routes by merging two parents — or look up combos, children,
          and owned-box waves.
        </p>
      </header>

      <main className="calculator" aria-label="Breeding calculator">
        {error ? <p className="status error">{error}</p> : null}
        {!dataset && !error ? (
          <p className="status">Loading breeding tables…</p>
        ) : null}

        {dataset ? (
          <>
            <div className="controls">
              <ModeToggle mode={mode} onChange={setMode} />

              <div className="global-filters">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={hideTerraria}
                    onChange={(e) => updateHideTerraria(e.target.checked)}
                  />
                  Hide Terraria monsters
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={hideWorldTreeLocked}
                    onChange={(e) =>
                      updateHideWorldTreeLocked(e.target.checked)
                    }
                  />
                  Hide World Tree exclusives
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={hideWorldTreeBreedable}
                    onChange={(e) =>
                      updateHideWorldTreeBreedable(e.target.checked)
                    }
                  />
                  Hide World Tree breedables
                </label>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    saveOwned(owned);
                    saveHideTerraria(hideTerraria);
                    saveHideWorldTreeLocked(hideWorldTreeLocked);
                    saveHideWorldTreeBreedable(hideWorldTreeBreedable);
                  }}
                >
                  Save preferences
                </button>
              </div>
            </div>

            {(mode === "parents" || mode === "child") && (
              <TrendingPals pals={trending} onPick={pickTrending} />
            )}

            {mode === "parents" ? (
              <div className="selectors">
                <PalSelect
                  label="Target Pal"
                  pals={selectablePals}
                  value={target}
                  onChange={setTarget}
                  placeholder="Search by name or Paldeck #"
                />
              </div>
            ) : null}

            {mode === "child" ? (
              <div className="selectors">
                <div className="selectors-two">
                  <PalSelect
                    label="Parent A"
                    pals={selectablePals}
                    value={parentA}
                    onChange={setParentA}
                    placeholder="First parent"
                  />
                  <PalSelect
                    label="Parent B"
                    pals={selectablePals}
                    value={parentB}
                    onChange={setParentB}
                    placeholder="Second parent (optional for scan)"
                  />
                </div>
                <button type="button" className="ghost swap" onClick={swapParents}>
                  Swap parents
                </button>
              </div>
            ) : null}

            {mode === "path" ? (
              <div className="selectors path-planner">
                <div className="path-submode" role="tablist" aria-label="Trait path mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={pathPlannerMode === "merge"}
                    className={pathPlannerMode === "merge" ? "active" : undefined}
                    onClick={() => setPathPlannerMode("merge")}
                  >
                    Merge two parents
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={pathPlannerMode === "chain"}
                    className={pathPlannerMode === "chain" ? "active" : undefined}
                    onClick={() => setPathPlannerMode("chain")}
                  >
                    Route through
                  </button>
                </div>

                <p className="hint-inline">
                  {pathPlannerMode === "merge"
                    ? "Build breeding trees that use both trait parents as roots — even if those two never breed with each other. Multiple trees are listed shortest-first."
                    : "Shortest chains from a start Pal to a target, optionally forced through waypoint species (in order). Multiple routes are listed shortest-first."}
                </p>

                {pathPlannerMode === "chain" ? (
                  <>
                    <div className="selectors-two">
                      <PalSelect
                        label="Start (trait parent)"
                        pals={selectablePals}
                        value={pathStart}
                        onChange={setPathStart}
                        placeholder="Starting Pal"
                      />
                      <PalSelect
                        label="Target child"
                        pals={selectablePals}
                        value={pathTarget}
                        onChange={setPathTarget}
                        placeholder="Final Pal"
                      />
                    </div>

                    <div className="waypoint-block">
                      <PalSelect
                        label="Add waypoint (route through)"
                        pals={selectablePals}
                        value={waypointPicker}
                        onChange={(pal) => {
                          setWaypointPicker(null);
                          if (pal) addWaypoint(pal);
                        }}
                        placeholder="Must appear as a child along the way"
                      />
                      {waypoints.length > 0 ? (
                        <div className="owned-selected">
                          {waypoints.map((pal, order) => (
                            <button
                              key={`${pal.index}-${order}`}
                              type="button"
                              className="trend-chip owned-chip"
                              onClick={() => removeWaypoint(pal.index)}
                              title="Remove waypoint"
                            >
                              <span className="waypoint-order">{order + 1}</span>
                              <PalPortrait pal={pal} size="sm" layout="row" />
                              <span className="remove-x" aria-hidden="true">
                                ×
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="quiet">
                          No waypoints yet — direct shortest path will be used.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="selectors-two">
                    <PalSelect
                      label="Trait parent A"
                      pals={selectablePals}
                      value={pathTraitA}
                      onChange={setPathTraitA}
                      placeholder="First trait source"
                    />
                    <PalSelect
                      label="Trait parent B"
                      pals={selectablePals}
                      value={pathTraitB}
                      onChange={setPathTraitB}
                      placeholder="Second trait source"
                    />
                    <PalSelect
                      label="Target child"
                      pals={selectablePals}
                      value={pathTarget}
                      onChange={setPathTarget}
                      placeholder="Final Pal"
                    />
                  </div>
                )}

                <label className="check">
                  <input
                    type="checkbox"
                    checked={includeTargetAsParent}
                    onChange={(e) => setIncludeTargetAsParent(e.target.checked)}
                  />
                  Include target child as a potential parent
                </label>
              </div>
            ) : null}

            {mode === "owned" ? (
              <div className="selectors">
                <PalSelect
                  label="Add owned Pal"
                  pals={selectablePals}
                  value={ownedPicker}
                  onChange={(pal) => {
                    setOwnedPicker(null);
                    if (pal) toggleOwned(pal.index);
                  }}
                  placeholder="Search Pals you own"
                />
              </div>
            ) : null}

            {mode === "browse" ? (
              <div className="selectors">
                <label className="browse-search">
                  <span>Search Pals</span>
                  <input
                    value={browseQuery}
                    onChange={(e) => setBrowseQuery(e.target.value)}
                    placeholder="Name or Paldeck #"
                  />
                </label>
              </div>
            ) : null}

            {mode === "child" && singleParentChildren.length > 0 ? (
              <section className="results">
                <h2>
                  Possible children from {(parentA ?? parentB)?.name}
                </h2>
                <p className="count">
                  {singleParentChildren.length} distinct offspring
                </p>
                <ul className="pair-list">
                  {singleParentChildren.map(({ child, partners }) => (
                    <li key={child.index}>
                      <div className="pair">
                        <PalPortrait pal={child} size="md" layout="row" />
                        <span className="meta-inline">
                          {partners.length} partner
                          {partners.length === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            if (!parentA) setParentA(partners[0] ?? null);
                            else setParentB(partners[0] ?? null);
                          }}
                        >
                          Use {partners[0]?.name}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <ResultsPanel
                mode={mode}
                target={target}
                parentA={parentA}
                parentB={parentB}
                pathStart={pathStart}
                pathTarget={pathTarget}
                pathTraitA={pathTraitA}
                pathTraitB={pathTraitB}
                pathPlannerMode={pathPlannerMode}
                waypoints={waypoints}
                child={childResult}
                pairs={parentPairs}
                path={pathResult}
                mergePaths={pathPlannerMode === "merge" ? mergePaths : []}
                mergeTotalCount={filteredMergeCandidates.length}
                mergeAllCount={mergeCandidates.length}
                chainPaths={pathPlannerMode === "chain" ? chainPaths : []}
                chainTotalCount={filteredChainCandidates.length}
                chainAllCount={chainCandidates.length}
                pathPairTags={pathPairTags}
                pathExcludeTags={pathExcludeTags}
                pathIncludePicker={pathIncludePicker}
                pathExcludePicker={pathExcludePicker}
                pathTagPals={selectablePals}
                onPathIncludePickerChange={setPathIncludePicker}
                onPathExcludePickerChange={setPathExcludePicker}
                onAddPathPairTag={addPathPairTag}
                onRemovePathPairTag={removePathPairTag}
                onAddPathExcludeTag={addPathExcludeTag}
                onRemovePathExcludeTag={removePathExcludeTag}
                onLoadMorePaths={() =>
                  setPathVisibleCount((n) => n + MERGE_PAGE_SIZE)
                }
                ownedResult={ownedResult}
                browsePals={browsePals}
                owned={ownedSet}
                mutationPassives={dataset.mutationPassives}
                mutationNote={dataset.meta.features.mutationSpeciesNote}
                onToggleOwned={toggleOwned}
              />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
