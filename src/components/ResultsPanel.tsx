import { useEffect, useMemo, useRef, useState } from "react";
import type { Mode, Pal } from "../lib/types";
import type { ParentPair } from "../lib/breeding";
import type { OwnedBreedResult, PathResult, PathStep } from "../lib/path";
import {
  pathResultFromSnapshot,
  pathStepKey,
  type SavedPathPlan,
} from "../lib/savedPaths";
import {
  normalizePassive,
  passiveRankClass,
  type SpecimenPassive,
  type SpecimenV1,
} from "../lib/specimens";
import type { ShareTreePal, ShareTreeV1 } from "../lib/shareTree";
import { formatWork } from "../lib/breeding";
import { buildComboHash, buildComboUrl } from "../lib/cannedLinks";
import type { SaveWorldCandidate } from "../lib/saveImport";
import { PalPortrait } from "./PalPortrait";
import { PalSelect } from "./PalSelect";
import { SpecimenInlineNotes, SpecimenStrip } from "./SpecimenStrip";

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
  mergePaths: PathResult[];
  mergeTotalCount: number;
  mergeAllCount: number;
  chainPaths: PathResult[];
  chainTotalCount: number;
  chainAllCount: number;
  pathPairTags: Pal[];
  pathExcludeTags: Pal[];
  pathIncludePicker: Pal | null;
  pathExcludePicker: Pal | null;
  pathTagPals: Pal[];
  onPathIncludePickerChange: (pal: Pal | null) => void;
  onPathExcludePickerChange: (pal: Pal | null) => void;
  onAddPathPairTag: (pal: Pal) => void;
  onRemovePathPairTag: (index: number) => void;
  onAddPathExcludeTag: (pal: Pal) => void;
  onRemovePathExcludeTag: (index: number) => void;
  onLoadMorePaths: () => void;
  activeSavedPlan: SavedPathPlan | null;
  onSavePath: (path: PathResult) => boolean;
  onSaveActivePlan: () => boolean;
  onCopyShareLink: () => boolean;
  onToggleSavedStep: (stepKey: string, completed: boolean) => void;
  onClearActiveSavedPlan: () => void;
  specimens: SpecimenV1[];
  shareBanner: string | null;
  onDismissShareBanner: () => void;
  resolveSpecimenPal?: (species: string) => Pal | null;
  ownedResult: OwnedBreedResult | null;
  browsePals: Pal[];
  owned: Set<number>;
  onToggleOwned: (index: number) => void;
  onClearOwned?: () => void;
  onImportOwnedFromSave?: (file: File) => Promise<void> | void;
  onImportOwnedFromSaveGamesFolder?: () => Promise<void> | void;
  onImportOwnedFromSaveGamesFiles?: (files: FileList) => void;
  browseWorldChoices?: SaveWorldCandidate[] | null;
  onChooseBrowseWorld?: (world: SaveWorldCandidate) => void;
  onDismissBrowseWorldChoices?: () => void;
  browseImportStatus?: string | null;
  browseImportBusy?: boolean;
  onDismissBrowseImportStatus?: () => void;
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
  return palsMatchQuery([pair.parentA, pair.parentB], query);
}

/** Match visible labels (name / Paldeck #) — not internal game IDs. */
function palsMatchQuery(
  pals: Pick<Pal, "name" | "dex" | "dexNo">[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const tokens = q.split(/[\s,+]+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystacks = pals.map((pal) =>
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
          Pairs you already own are highlighted and sorted first. Click a row to
          open that offspring combo.
        </p>
      ) : (
        <p className="hint-inline">
          Click a row to open that offspring combo.
        </p>
      )}

      {pairs.length === 0 ? (
        <p className="quiet">No parent pairs found for this Pal.</p>
      ) : filteredPairs.length === 0 ? (
        <p className="quiet">
          No pairs match “{resultsQuery.trim()}”. Try another name or Paldeck
          number.
        </p>
      ) : (
        <ul className="parent-combo-list">
          {filteredPairs.map((pair) => {
            const bothOwned =
              owned.has(pair.parentA.index) && owned.has(pair.parentB.index);
            const childHash = buildComboHash({
              v: 1,
              mode: "child",
              a: pair.parentA.name,
              b: pair.parentB.name,
            });
            const label = `${pair.parentA.name} + ${pair.parentB.name} = ${target.name}`;
            return (
              <li key={pair.comboIndex}>
                <button
                  type="button"
                  className={`parent-combo-row${bothOwned ? " owned" : ""}`}
                  title={
                    pair.genderNote
                      ? `${label} — ${pair.genderNote}`
                      : `${label} (open offspring)`
                  }
                  aria-label={
                    pair.genderNote
                      ? `${label}. ${pair.genderNote}`
                      : label
                  }
                  onClick={() => {
                    window.location.hash = childHash;
                  }}
                >
                  <PalPortrait
                    pal={pair.parentA}
                    size="sm"
                    layout="row"
                    owned={owned.has(pair.parentA.index)}
                  />
                  <span className="parent-combo-op" aria-hidden="true">
                    +
                  </span>
                  <PalPortrait
                    pal={pair.parentB}
                    size="sm"
                    layout="row"
                    owned={owned.has(pair.parentB.index)}
                  />
                  <span className="parent-combo-op" aria-hidden="true">
                    =
                  </span>
                  <PalPortrait pal={target} size="sm" layout="row" />
                  {bothOwned ? (
                    <span className="parent-combo-owned-mark" aria-hidden="true">
                      ●
                    </span>
                  ) : null}
                </button>
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
}: Props) {
  const [copiedForHash, setCopiedForHash] = useState<string | null>(null);

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
      {child ? (
        <div className="save-plan-control" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const parentsHash = buildComboHash({
                v: 1,
                mode: "parents",
                t: child.name,
              });
              window.location.hash = parentsHash;
            }}
          >
            Parent pairs link
          </button>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              try {
                const parentsUrl = buildComboUrl({
                  v: 1,
                  mode: "parents",
                  t: child.name,
                });
                await navigator.clipboard.writeText(parentsUrl);
                const parentsHash = buildComboHash({
                  v: 1,
                  mode: "parents",
                  t: child.name,
                });
                setCopiedForHash(parentsHash);
                window.setTimeout(() => {
                  setCopiedForHash((prev) =>
                    prev === parentsHash ? null : prev,
                  );
                }, 2500);
              } catch {
                // Clipboard may be blocked; no hard failure required.
              }
            }}
          >
            {copiedForHash ===
            buildComboHash({ v: 1, mode: "parents", t: child.name })
              ? "Copied"
              : "Copy link"}
          </button>
        </div>
      ) : null}
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
  mergePaths,
  mergeTotalCount,
  mergeAllCount,
  chainPaths,
  chainTotalCount,
  chainAllCount,
  pathPairTags,
  pathExcludeTags,
  pathIncludePicker,
  pathExcludePicker,
  pathTagPals,
  onPathIncludePickerChange,
  onPathExcludePickerChange,
  onAddPathPairTag,
  onRemovePathPairTag,
  onAddPathExcludeTag,
  onRemovePathExcludeTag,
  onLoadMorePaths,
  activeSavedPlan,
  onSavePath,
  onSaveActivePlan,
  onCopyShareLink,
  onToggleSavedStep,
  onClearActiveSavedPlan,
  specimens,
  shareBanner,
  onDismissShareBanner,
  resolveSpecimenPal,
}: Props) {
  if (activeSavedPlan) {
    return (
      <SavedPlanResults
        plan={activeSavedPlan}
        specimens={activeSavedPlan.specimens ?? specimens}
        resolveSpecimenPal={resolveSpecimenPal}
        isUnsavedSession={Boolean(
          activeSavedPlan.source === "share" &&
            activeSavedPlan.id.startsWith("shared-"),
        )}
        onSaveActivePlan={onSaveActivePlan}
        onCopyShareLink={onCopyShareLink}
        onToggleSavedStep={onToggleSavedStep}
        onClearActiveSavedPlan={onClearActiveSavedPlan}
        shareBanner={shareBanner}
        onDismissShareBanner={onDismissShareBanner}
      />
    );
  }

  const ready =
    pathPlannerMode === "chain"
      ? Boolean(pathStart && pathTarget)
      : Boolean(pathTraitA && pathTraitB && pathTarget);

  if (!ready) {
    return (
      <section className="results">
        <ShareBanner message={shareBanner} onDismiss={onDismissShareBanner} />
        <SpecimenStrip
          specimens={specimens}
          resolvePal={resolveSpecimenPal}
        />
        <h2>Trait path planner</h2>
        <p className="quiet">
          {pathPlannerMode === "chain"
            ? "Pick a start Pal and target. Optionally add waypoints that the chain must pass through."
            : "Pick two trait parents and a target. The planner lists merge trees shortest-first."}
        </p>
      </section>
    );
  }

  const tagProps = {
    pathPairTags,
    pathExcludeTags,
    pathIncludePicker,
    pathExcludePicker,
    pathTagPals,
    onPathIncludePickerChange,
    onPathExcludePickerChange,
    onAddPathPairTag,
    onRemovePathPairTag,
    onAddPathExcludeTag,
    onRemovePathExcludeTag,
  };

  if (pathPlannerMode === "merge") {
    return (
      <MergePathResults
        pathTraitA={pathTraitA}
        pathTraitB={pathTraitB}
        pathTarget={pathTarget}
        mergePaths={mergePaths}
        mergeTotalCount={mergeTotalCount}
        mergeAllCount={mergeAllCount}
        onLoadMorePaths={onLoadMorePaths}
        onSavePath={onSavePath}
        onCopyShareLink={onCopyShareLink}
        specimens={specimens}
        shareBanner={shareBanner}
        onDismissShareBanner={onDismissShareBanner}
        resolveSpecimenPal={resolveSpecimenPal}
        {...tagProps}
      />
    );
  }

  return (
    <ChainPathResults
      pathStart={pathStart}
      pathTarget={pathTarget}
      waypoints={waypoints}
      chainPaths={chainPaths}
      chainTotalCount={chainTotalCount}
      chainAllCount={chainAllCount}
      onLoadMorePaths={onLoadMorePaths}
      onSavePath={onSavePath}
      onCopyShareLink={onCopyShareLink}
      specimens={specimens}
      shareBanner={shareBanner}
      onDismissShareBanner={onDismissShareBanner}
      resolveSpecimenPal={resolveSpecimenPal}
      {...tagProps}
    />
  );
}

function ShareBanner({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div className="share-banner" role="status">
      <p>{message}</p>
      <button type="button" className="ghost" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

type PathTagFilterProps = {
  pathPairTags: Pal[];
  pathExcludeTags: Pal[];
  pathIncludePicker: Pal | null;
  pathExcludePicker: Pal | null;
  pathTagPals: Pal[];
  onPathIncludePickerChange: (pal: Pal | null) => void;
  onPathExcludePickerChange: (pal: Pal | null) => void;
  onAddPathPairTag: (pal: Pal) => void;
  onRemovePathPairTag: (index: number) => void;
  onAddPathExcludeTag: (pal: Pal) => void;
  onRemovePathExcludeTag: (index: number) => void;
};

function PathPairingTagFilters({
  pathPairTags,
  pathExcludeTags,
  pathIncludePicker,
  pathExcludePicker,
  pathTagPals,
  onPathIncludePickerChange,
  onPathExcludePickerChange,
  onAddPathPairTag,
  onRemovePathPairTag,
  onAddPathExcludeTag,
  onRemovePathExcludeTag,
}: PathTagFilterProps) {
  const usedIndexes = new Set([
    ...pathPairTags.map((pal) => pal.index),
    ...pathExcludeTags.map((pal) => pal.index),
  ]);
  const tagPickerPals = pathTagPals.filter((pal) => !usedIndexes.has(pal.index));

  return (
    <div className="merge-tag-filters">
      <div className="merge-tag-filter">
        <PalSelect
          label="Must include pairing"
          pals={tagPickerPals}
          value={pathIncludePicker}
          onChange={(pal) => {
            onPathIncludePickerChange(null);
            if (pal) onAddPathPairTag(pal);
          }}
          placeholder="Add a Pal you can breed with…"
          clearAfterSelect
        />
        {pathPairTags.length > 0 ? (
          <div className="owned-selected">
            {pathPairTags.map((pal) => (
              <button
                key={pal.index}
                type="button"
                className="trend-chip owned-chip"
                onClick={() => onRemovePathPairTag(pal.index)}
                title="Remove include tag"
              >
                <PalPortrait pal={pal} size="sm" layout="row" />
                <span className="remove-x" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="quiet">
            Tag owned Pals you want in the plan. Multiple tags use AND.
          </p>
        )}
      </div>

      <div className="merge-tag-filter">
        <PalSelect
          label="Exclude from path"
          pals={tagPickerPals}
          value={pathExcludePicker}
          onChange={(pal) => {
            onPathExcludePickerChange(null);
            if (pal) onAddPathExcludeTag(pal);
          }}
          placeholder="Hide routes that need this Pal…"
          clearAfterSelect
        />
        {pathExcludeTags.length > 0 ? (
          <div className="owned-selected">
            {pathExcludeTags.map((pal) => (
              <button
                key={pal.index}
                type="button"
                className="trend-chip owned-chip exclude-chip"
                onClick={() => onRemovePathExcludeTag(pal.index)}
                title="Remove exclude tag"
              >
                <PalPortrait pal={pal} size="sm" layout="row" />
                <span className="remove-x" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="quiet">
            Tag Pals you don’t own to hide routes that rely on them.
          </p>
        )}
      </div>
    </div>
  );
}

function ChainPathResults({
  pathStart,
  pathTarget,
  waypoints,
  chainPaths,
  chainTotalCount,
  chainAllCount,
  onLoadMorePaths,
  onSavePath,
  onCopyShareLink,
  specimens,
  shareBanner,
  onDismissShareBanner,
  resolveSpecimenPal,
  ...tagProps
}: {
  pathStart: Pal | null;
  pathTarget: Pal | null;
  waypoints: Pal[];
  chainPaths: PathResult[];
  chainTotalCount: number;
  chainAllCount: number;
  onLoadMorePaths: () => void;
  onSavePath: (path: PathResult) => boolean;
  onCopyShareLink: () => boolean;
  specimens: SpecimenV1[];
  shareBanner: string | null;
  onDismissShareBanner: () => void;
  resolveSpecimenPal?: (species: string) => Pal | null;
} & PathTagFilterProps) {
  if (
    pathStart &&
    pathTarget &&
    pathStart.index === pathTarget.index &&
    waypoints.length === 0
  ) {
    return (
      <section className="results">
        <ShareBanner message={shareBanner} onDismiss={onDismissShareBanner} />
        <SpecimenStrip
          specimens={specimens}
          resolvePal={resolveSpecimenPal}
        />
        <h2>Trait path planner</h2>
        <p className="quiet">Already at the target — no breeds needed.</p>
      </section>
    );
  }

  if (chainAllCount === 0) {
    return (
      <section className="results">
        <ShareBanner message={shareBanner} onDismiss={onDismissShareBanner} />
        <SpecimenStrip
          specimens={specimens}
          resolvePal={resolveSpecimenPal}
        />
        <h2>Trait path planner</h2>
        <p className="quiet">No breeding route found for that setup.</p>
      </section>
    );
  }

  const tagsActive =
    tagProps.pathPairTags.length > 0 || tagProps.pathExcludeTags.length > 0;
  const reachable = chainPaths.filter((p) => !p.unreachable);
  const showing = chainPaths.length;
  const remaining = Math.max(0, chainTotalCount - showing);

  return (
    <section className="results">
      <ShareBanner message={shareBanner} onDismiss={onDismissShareBanner} />
      <SpecimenStrip specimens={specimens} resolvePal={resolveSpecimenPal} />
      <div className="results-head">
        <div className="results-target">
          {pathStart ? (
            <PalPortrait pal={pathStart} size="md" layout="row" />
          ) : null}
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
        </div>
        <div className="results-head-actions">
          <p className="count">
            {chainTotalCount.toLocaleString()}
            {tagsActive ? ` of ${chainAllCount.toLocaleString()}` : ""} route
            {chainTotalCount === 1 ? "" : "s"}
            {showing < chainTotalCount
              ? ` · showing ${showing.toLocaleString()}`
              : ""}
          </p>
          <CopyShareButton onCopyShareLink={onCopyShareLink} />
        </div>
      </div>

      <PathPairingTagFilters {...tagProps} />

      <p className="quiet">
        Species-level plans sorted by fewest breeds (including routes up to +2
        breeds) — passives/IVs are not simulated.
      </p>

      {chainTotalCount === 0 ? (
        <p className="quiet">No routes match those pairing tags.</p>
      ) : (
        <>
          <div className="merge-tree-list">
            {reachable.map((path, index) => (
              <ChainRouteCard
                key={chainRouteKey(path, index)}
                path={path}
                index={index}
                onSavePath={onSavePath}
                specimens={specimens}
              />
            ))}
          </div>

          {remaining > 0 ? (
            <button type="button" className="load-more" onClick={onLoadMorePaths}>
              Load more
              <span className="meta-inline">
                ({Math.min(5, remaining).toLocaleString()} of{" "}
                {remaining.toLocaleString()} remaining)
              </span>
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function MergePathResults({
  pathTraitA,
  pathTraitB,
  pathTarget,
  mergePaths,
  mergeTotalCount,
  mergeAllCount,
  onLoadMorePaths,
  onSavePath,
  onCopyShareLink,
  specimens,
  shareBanner,
  onDismissShareBanner,
  resolveSpecimenPal,
  ...tagProps
}: {
  pathTraitA: Pal | null;
  pathTraitB: Pal | null;
  pathTarget: Pal | null;
  mergePaths: PathResult[];
  mergeTotalCount: number;
  mergeAllCount: number;
  onLoadMorePaths: () => void;
  onSavePath: (path: PathResult) => boolean;
  onCopyShareLink: () => boolean;
  specimens: SpecimenV1[];
  shareBanner: string | null;
  onDismissShareBanner: () => void;
  resolveSpecimenPal?: (species: string) => Pal | null;
} & PathTagFilterProps) {
  if (
    pathTraitA &&
    pathTraitB &&
    pathTarget &&
    pathTraitA.index === pathTarget.index &&
    pathTraitB.index === pathTarget.index
  ) {
    return (
      <section className="results">
        <ShareBanner message={shareBanner} onDismiss={onDismissShareBanner} />
        <SpecimenStrip
          specimens={specimens}
          resolvePal={resolveSpecimenPal}
        />
        <h2>Trait path planner</h2>
        <p className="quiet">Already the target species — no breeds needed.</p>
      </section>
    );
  }

  if (mergeAllCount === 0) {
    return (
      <section className="results">
        <ShareBanner message={shareBanner} onDismiss={onDismissShareBanner} />
        <SpecimenStrip
          specimens={specimens}
          resolvePal={resolveSpecimenPal}
        />
        <h2>Trait path planner</h2>
        <p className="quiet">No merge tree found that uses both parents.</p>
      </section>
    );
  }

  const tagsActive =
    tagProps.pathPairTags.length > 0 || tagProps.pathExcludeTags.length > 0;
  const reachable = mergePaths.filter((p) => !p.unreachable);
  const showing = mergePaths.length;
  const remaining = Math.max(0, mergeTotalCount - showing);

  return (
    <section className="results">
      <ShareBanner message={shareBanner} onDismiss={onDismissShareBanner} />
      <SpecimenStrip specimens={specimens} resolvePal={resolveSpecimenPal} />
      <div className="results-head">
        <div className="results-target">
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
        </div>
        <div className="results-head-actions">
          <p className="count">
            {mergeTotalCount.toLocaleString()}
            {tagsActive ? ` of ${mergeAllCount.toLocaleString()}` : ""} merge
            tree
            {mergeTotalCount === 1 ? "" : "s"}
            {showing < mergeTotalCount
              ? ` · showing ${showing.toLocaleString()}`
              : ""}
          </p>
          <CopyShareButton onCopyShareLink={onCopyShareLink} />
        </div>
      </div>

      <PathPairingTagFilters {...tagProps} />

      <p className="quiet">
        Species-level plans sorted by fewest breeds — passives/IVs are not
        simulated.
      </p>

      {mergeTotalCount === 0 ? (
        <p className="quiet">No merge trees match those pairing tags.</p>
      ) : (
        <>
          <div className="merge-tree-list">
            {reachable.map((path, index) => (
              <MergeTreeCard
                key={mergeTreeKey(path, index)}
                path={path}
                index={index}
                onSavePath={onSavePath}
                specimens={specimens}
              />
            ))}
          </div>

          {remaining > 0 ? (
            <button type="button" className="load-more" onClick={onLoadMorePaths}>
              Load more
              <span className="meta-inline">
                ({Math.min(5, remaining).toLocaleString()} of{" "}
                {remaining.toLocaleString()} remaining)
              </span>
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function chainRouteKey(path: PathResult, index: number): string {
  const body = path.steps
    .map((s) => `${s.from.index}-${s.partner.index}-${s.child.index}`)
    .join(">");
  return `${body || "empty"}-${index}`;
}

function ChainRouteCard({
  path,
  index,
  onSavePath,
  specimens,
}: {
  path: PathResult;
  index: number;
  onSavePath: (path: PathResult) => boolean;
  specimens: SpecimenV1[];
}) {
  return (
    <article className="merge-tree-card">
      <div className="merge-tree-card-head">
        <h3>Route {index + 1}</h3>
        <div className="merge-tree-card-actions">
          <p className="count">
            {path.totalBreeds} breed{path.totalBreeds === 1 ? "" : "s"}
          </p>
          {path.steps.length > 0 ? (
            <SavePlanButton path={path} onSavePath={onSavePath} />
          ) : null}
        </div>
      </div>
      {path.summary ? <p className="hint-inline">{path.summary}</p> : null}
      {path.steps.length === 0 ? (
        <p className="quiet">Already at the target — no breeds needed.</p>
      ) : (
        <PathSection
          title="Breeding steps"
          steps={path.steps}
          specimens={specimens}
        />
      )}
    </article>
  );
}

function mergeTreeKey(path: PathResult, index: number): string {
  if (path.merge) {
    return `${path.merge.left.index}-${path.merge.right.index}-${path.merge.child.index}-${index}`;
  }
  return `merge-${index}`;
}

function MergeTreeCard({
  path,
  index,
  onSavePath,
  specimens,
}: {
  path: PathResult;
  index: number;
  onSavePath: (path: PathResult) => boolean;
  specimens: SpecimenV1[];
}) {
  const branchA = path.steps.filter((s) => s.role === "branch-a");
  const branchB = path.steps.filter((s) => s.role === "branch-b");
  const mergeSteps = path.steps.filter((s) => s.role === "merge");
  const finishSteps = path.steps.filter((s) => s.role === "finish");

  return (
    <article className="merge-tree-card">
      <div className="merge-tree-card-head">
        <h3>
          Tree {index + 1}
          {path.merge ? (
            <span className="merge-tree-label">
              {" "}
              · {path.merge.left.name} × {path.merge.right.name} →{" "}
              {path.merge.child.name}
            </span>
          ) : null}
        </h3>
        <div className="merge-tree-card-actions">
          <p className="count">
            {path.totalBreeds} breed{path.totalBreeds === 1 ? "" : "s"}
          </p>
          {path.steps.length > 0 ? (
            <SavePlanButton path={path} onSavePath={onSavePath} />
          ) : null}
        </div>
      </div>

      {path.steps.length === 0 ? (
        <p className="quiet">Already at the target — no breeds needed.</p>
      ) : (
        <div className="tree-sections">
          <PathSection
            title="Branch A — from trait parent A"
            steps={branchA}
            specimens={specimens}
          />
          <PathSection
            title="Branch B — from trait parent B"
            steps={branchB}
            specimens={specimens}
          />
          <PathSection
            title="Merge — combine the two branches"
            steps={mergeSteps}
            specimens={specimens}
          />
          <PathSection
            title="Finish — to target"
            steps={finishSteps}
            specimens={specimens}
          />
        </div>
      )}
    </article>
  );
}

function CopyShareButton({
  onCopyShareLink,
}: {
  onCopyShareLink: () => boolean;
}) {
  const [tip, setTip] = useState(false);

  useEffect(() => {
    if (!tip) return;
    const timer = window.setTimeout(() => setTip(false), 2500);
    return () => window.clearTimeout(timer);
  }, [tip]);

  return (
    <div className="save-plan-control">
      <button
        type="button"
        className="ghost"
        onClick={() => {
          if (onCopyShareLink()) setTip(true);
        }}
      >
        Copy share link
      </button>
      {tip ? (
        <div className="save-plan-tip" role="status">
          Link copied — paste it in chat or Discord
        </div>
      ) : null}
    </div>
  );
}

function SavePlanButton({
  path,
  onSavePath,
}: {
  path: PathResult;
  onSavePath: (path: PathResult) => boolean;
}) {
  const [tip, setTip] = useState(false);

  useEffect(() => {
    if (!tip) return;
    const timer = window.setTimeout(() => setTip(false), 5000);
    return () => window.clearTimeout(timer);
  }, [tip]);

  return (
    <div className="save-plan-control">
      <button
        type="button"
        className="ghost"
        onClick={() => {
          if (onSavePath(path)) setTip(true);
        }}
      >
        Save this plan
      </button>
      {tip ? (
        <div className="save-plan-tip" role="status">
          Saved — find it anytime in Settings (gear icon)
        </div>
      ) : null}
    </div>
  );
}

function SavedPlanResults({
  plan,
  specimens,
  resolveSpecimenPal,
  isUnsavedSession,
  onSaveActivePlan,
  onCopyShareLink,
  onToggleSavedStep,
  onClearActiveSavedPlan,
  shareBanner,
  onDismissShareBanner,
}: {
  plan: SavedPathPlan;
  specimens: SpecimenV1[];
  resolveSpecimenPal?: (species: string) => Pal | null;
  isUnsavedSession: boolean;
  onSaveActivePlan: () => boolean;
  onCopyShareLink: () => boolean;
  onToggleSavedStep: (stepKey: string, completed: boolean) => void;
  onClearActiveSavedPlan: () => void;
  shareBanner: string | null;
  onDismissShareBanner: () => void;
}) {
  const path = pathResultFromSnapshot(plan.result);
  const completed = new Set(plan.completedStepKeys);
  const total = path.steps.length;
  const done = path.steps.filter((step) =>
    completed.has(pathStepKey(step)),
  ).length;

  const branchA = path.steps.filter((s) => s.role === "branch-a");
  const branchB = path.steps.filter((s) => s.role === "branch-b");
  const mergeSteps = path.steps.filter((s) => s.role === "merge");
  const finishSteps = path.steps.filter((s) => s.role === "finish");
  const chainish =
    plan.plannerMode === "chain" ||
    path.steps.every((s) => !s.role || s.role === "chain");
  const trackProgress = {
    completedKeys: completed,
    onToggle: onToggleSavedStep,
  };

  return (
    <section className="results">
      <ShareBanner message={shareBanner} onDismiss={onDismissShareBanner} />
      <SpecimenStrip specimens={specimens} resolvePal={resolveSpecimenPal} />
      <div className="results-head">
        <div className="saved-plan-view-head">
          <h2>{plan.name}</h2>
          <p className="quiet">
            {isUnsavedSession
              ? "Shared tree (not saved yet)"
              : `Saved ${plan.plannerMode === "merge" ? "merge tree" : "route"}`}
            {" · "}
            {done}/{total} steps done
          </p>
        </div>
        <div className="results-head-actions">
          {isUnsavedSession ? (
            <SaveActivePlanButton onSaveActivePlan={onSaveActivePlan} />
          ) : null}
          <CopyShareButton onCopyShareLink={onCopyShareLink} />
          <button type="button" className="ghost" onClick={onClearActiveSavedPlan}>
            Back to search results
          </button>
        </div>
      </div>

      <article className="merge-tree-card saved-plan-card">
        {path.summary ? <p className="hint-inline">{path.summary}</p> : null}
        {path.steps.length === 0 ? (
          <p className="quiet">Already at the target — no breeds needed.</p>
        ) : chainish ? (
          <PathSection
            title="Breeding steps"
            steps={path.steps}
            progress={trackProgress}
            specimens={specimens}
            tree={plan.tree}
          />
        ) : (
          <div className="tree-sections">
            <PathSection
              title="Branch A — from trait parent A"
              steps={branchA}
              progress={trackProgress}
              specimens={specimens}
              tree={plan.tree}
            />
            <PathSection
              title="Branch B — from trait parent B"
              steps={branchB}
              progress={trackProgress}
              specimens={specimens}
              tree={plan.tree}
            />
            <PathSection
              title="Merge — combine the two branches"
              steps={mergeSteps}
              progress={trackProgress}
              specimens={specimens}
              tree={plan.tree}
            />
            <PathSection
              title="Finish — to target"
              steps={finishSteps}
              progress={trackProgress}
              specimens={specimens}
              tree={plan.tree}
            />
          </div>
        )}
      </article>
    </section>
  );
}

function SaveActivePlanButton({
  onSaveActivePlan,
}: {
  onSaveActivePlan: () => boolean;
}) {
  const [tip, setTip] = useState(false);

  useEffect(() => {
    if (!tip) return;
    const timer = window.setTimeout(() => setTip(false), 5000);
    return () => window.clearTimeout(timer);
  }, [tip]);

  return (
    <div className="save-plan-control">
      <button
        type="button"
        className="ghost"
        onClick={() => {
          if (onSaveActivePlan()) setTip(true);
        }}
      >
        Save this plan
      </button>
      {tip ? (
        <div className="save-plan-tip" role="status">
          Saved — find it anytime in Settings (gear icon)
        </div>
      ) : null}
    </div>
  );
}

function PathSection({
  title,
  steps,
  progress,
  specimens = [],
  tree,
}: {
  title: string;
  steps: PathStep[];
  progress?: {
    completedKeys: Set<string>;
    onToggle: (stepKey: string, completed: boolean) => void;
  };
  specimens?: SpecimenV1[];
  tree?: ShareTreeV1;
}) {
  if (steps.length === 0) return null;
  return (
    <div className="wave">
      <h3>{title}</h3>
      <ol className="path-list">
        {steps.map((step, index) => {
          const key = pathStepKey(step);
          const done = progress?.completedKeys.has(key) ?? false;
          const treeStep =
            tree?.steps.find(
              (s) =>
                speciesOfTreePal(s.from) === step.from.name &&
                speciesOfTreePal(s.partner) === step.partner.name &&
                speciesOfTreePal(s.child) === step.child.name,
            ) ?? tree?.steps[index];
          const metaBits = [
            step.note?.trim() || treeStep?.note?.trim(),
            step.pool != null
              ? `Pool ${step.pool}`
              : treeStep?.pool != null
                ? `Pool ${treeStep.pool}`
                : null,
          ].filter(Boolean);
          return (
            <li
              key={`${key}-${index}`}
              className={done ? "path-step-done" : undefined}
            >
              {progress ? (
                <label className="path-step-check">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(e) => progress.onToggle(key, e.target.checked)}
                    aria-label={`Mark step ${index + 1} complete`}
                  />
                </label>
              ) : (
                <span className="step-num">{index + 1}</span>
              )}
              <div className="path-step-body">
                <div
                  className={`pair${step.role === "merge" ? " pair-owned" : ""}`}
                >
                  <StepPalBlock
                    pal={step.from}
                    side={treeStep?.from}
                    specimens={specimens}
                  />
                  <span className="plus">+</span>
                  <StepPalBlock
                    pal={step.partner}
                    side={treeStep?.partner}
                    specimens={specimens}
                  />
                  <span className="plus">→</span>
                  <StepPalBlock
                    pal={step.child}
                    side={treeStep?.child}
                    specimens={specimens}
                  />
                  {step.role === "merge" ? (
                    <span className="badge owned-badge">Merge</span>
                  ) : null}
                </div>
                {metaBits.length ? (
                  <p className="path-step-meta quiet">{metaBits.join(" · ")}</p>
                ) : null}
                {!tree && specimens.length > 0 ? (
                  <div className="specimen-step-notes">
                    <SpecimenInlineNotes
                      specimens={specimens}
                      speciesName={step.from.name}
                    />
                    <SpecimenInlineNotes
                      specimens={specimens}
                      speciesName={step.partner.name}
                    />
                    <SpecimenInlineNotes
                      specimens={specimens}
                      speciesName={step.child.name}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepPalBlock({
  pal,
  side,
  specimens,
}: {
  pal: Pal;
  side?: string | ShareTreePal;
  specimens: SpecimenV1[];
}) {
  const fromSide =
    side && typeof side !== "string"
      ? side
      : specimens.find(
          (s) => s.species.trim().toLowerCase() === pal.name.trim().toLowerCase(),
        );
  const gender =
    fromSide && "gender" in fromSide ? fromSide.gender : undefined;
  const passives: SpecimenPassive[] = (
    fromSide && "passives" in fromSide && fromSide.passives
      ? fromSide.passives
      : []
  ).map(normalizePassive);

  return (
    <div className="path-step-pal">
      <div className="path-step-pal-head">
        <PalPortrait pal={pal} size="md" layout="row" />
        {gender && gender !== "unknown" ? (
          <span
            className={`pal-badge pal-badge-gender gender-${gender}`}
            title={gender}
            aria-label={gender}
          >
            {gender === "male" ? "♂" : "♀"}
          </span>
        ) : null}
      </div>
      {passives.length > 0 ? (
        <ul className="path-step-passives">
          {passives.map((p) => (
            <li
              key={p.name}
              className={`passive-nameplate compact ${passiveRankClass(p.rank)}`}
              title={p.description}
            >
              {p.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function speciesOfTreePal(value: string | ShareTreePal): string {
  return typeof value === "string" ? value : value.species;
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

function BrowseResults({
  browsePals,
  owned,
  onToggleOwned,
  onClearOwned,
  onImportOwnedFromSave,
  onImportOwnedFromSaveGamesFolder,
  onImportOwnedFromSaveGamesFiles,
  browseWorldChoices,
  onChooseBrowseWorld,
  onDismissBrowseWorldChoices,
  browseImportStatus,
  browseImportBusy,
  onDismissBrowseImportStatus,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const canImport =
    Boolean(onImportOwnedFromSave) ||
    Boolean(onImportOwnedFromSaveGamesFolder) ||
    Boolean(onImportOwnedFromSaveGamesFiles);

  return (
    <section className="results">
      <div className="results-head">
        <div>
          <h2>Browse all Pals</h2>
          <p className="count">
            {browsePals.length} shown · {owned.size} owned
          </p>
        </div>
        <div className="results-head-actions">
          {canImport ? (
            <>
              {onImportOwnedFromSave ? (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sav,application/octet-stream"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void onImportOwnedFromSave(file);
                  }}
                />
              ) : null}
              {onImportOwnedFromSaveGamesFiles ? (
                <input
                  ref={(el) => {
                    folderInputRef.current = el;
                    if (el) el.setAttribute("webkitdirectory", "");
                  }}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = e.target.files;
                    e.target.value = "";
                    if (files && files.length > 0) {
                      onImportOwnedFromSaveGamesFiles(files);
                    }
                  }}
                />
              ) : null}
              {onImportOwnedFromSaveGamesFolder ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={browseImportBusy}
                  onClick={() => void onImportOwnedFromSaveGamesFolder()}
                >
                  Use SaveGames folder
                </button>
              ) : onImportOwnedFromSaveGamesFiles ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={browseImportBusy}
                  onClick={() => folderInputRef.current?.click()}
                >
                  Use SaveGames folder
                </button>
              ) : null}
              {onImportOwnedFromSave ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={browseImportBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {browseImportBusy ? "Importing…" : "Import Level.sav"}
                </button>
              ) : null}
            </>
          ) : null}
          {onClearOwned && owned.size > 0 ? (
            <button
              type="button"
              className="ghost"
              disabled={browseImportBusy}
              onClick={onClearOwned}
            >
              Clear owned
            </button>
          ) : null}
        </div>
      </div>
      <p className="hint-inline">
        Click pals to mark them owned, or import from Steam saves (parsed in
        this browser only). Prefer{" "}
        <strong>Use SaveGames folder</strong> →{" "}
        <code>%LOCALAPPDATA%\Pal\Saved\SaveGames</code>, or upload a single{" "}
        <code>Level.sav</code> from a world folder.
      </p>
      {browseImportStatus ? (
        <div className="share-banner" role="status">
          <p>{browseImportStatus}</p>
          {onDismissBrowseImportStatus ? (
            <button
              type="button"
              className="ghost"
              onClick={onDismissBrowseImportStatus}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
      {browseWorldChoices && browseWorldChoices.length > 0 ? (
        <div className="browse-world-picker">
          <div className="browse-world-picker-head">
            <h3>Choose a world</h3>
            {onDismissBrowseWorldChoices ? (
              <button
                type="button"
                className="ghost"
                disabled={browseImportBusy}
                onClick={onDismissBrowseWorldChoices}
              >
                Cancel
              </button>
            ) : null}
          </div>
          <ul className="browse-world-list">
            {browseWorldChoices.map((world) => (
              <li key={world.id}>
                <button
                  type="button"
                  className="browse-world-row"
                  disabled={browseImportBusy}
                  onClick={() => onChooseBrowseWorld?.(world)}
                >
                  <span className="browse-world-label">{world.label}</span>
                  <span className="browse-world-path quiet">
                    {world.relativePath}
                  </span>
                  {world.modifiedAt ? (
                    <span className="browse-world-meta quiet">
                      {new Date(world.modifiedAt).toLocaleString()}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
