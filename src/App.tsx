import { useEffect, useMemo, useRef, useState } from "react";
import { ModeToggle } from "./components/ModeToggle";
import { PalPortrait } from "./components/PalPortrait";
import { PalSelect } from "./components/PalSelect";
import { ResultsPanel } from "./components/ResultsPanel";
import {
  SettingsDrawer,
  SettingsGearButton,
} from "./components/SettingsDrawer";
import { ThemePet } from "./components/ThemePet";
import {
  childrenFromParent,
  filterPals,
  findChild,
  findParents,
  loadDataset,
} from "./lib/breeding";
import {
  buildMergeTree,
  filterChainCandidatesByPairingSearch,
  filterMergeCandidatesByPairingSearch,
  findChainCandidates,
  findMergeCandidates,
  multiPalBreeder,
  sortPathResultsByFeasibility,
  type MergeCandidate,
  type PathResult,
} from "./lib/path";
import {
  loadHideTerraria,
  loadHideWorldTreeBreedable,
  loadHideWorldTreeLocked,
  loadOwned,
  loadShowPet,
  saveHideTerraria,
  saveHideWorldTreeBreedable,
  saveHideWorldTreeLocked,
  saveOwned,
  saveShowPet,
} from "./lib/storage";
import {
  createSavedPathPlanId,
  defaultPlanName,
  deleteSavedPathPlan,
  loadSavedPathPlans,
  snapshotPathResult,
  updateSavedPathProgress,
  upsertSavedPathPlan,
  type SavedPathPlan,
} from "./lib/savedPaths";
import {
  buildViewUrl,
  encodeSharePayload,
  parseShareFromLocation,
  resolvePalName,
  resolveSharePayload,
  sharePayloadFromPlanner,
  treeForShare,
} from "./lib/share";
import {
  parseComboFromLocation,
  encodeComboPayload,
  type ComboPayloadV1,
} from "./lib/cannedLinks";
import {
  discoverWorldsFromDirectoryHandle,
  discoverWorldsFromFileList,
  importOwnedFromLevelSav,
  pickSaveGamesDirectory,
  supportsSaveGamesFolderPicker,
  type SaveWorldCandidate,
} from "./lib/saveImport";
import type { SpecimenV1 } from "./lib/specimens";
import {
  applyTheme,
  loadTheme,
  saveTheme,
  type ThemeId,
} from "./lib/theme";
import type { BreedingDataset, Mode, Pal } from "./lib/types";

type PathPlannerMode = "chain" | "merge";

const MERGE_PAGE_SIZE = 5;

export default function App() {
  const [dataset, setDataset] = useState<BreedingDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("path");
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme());
  const [showPet, setShowPet] = useState(() => loadShowPet());
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [savedPlans, setSavedPlans] = useState<SavedPathPlan[]>(() =>
    loadSavedPathPlans(),
  );
  const [activeSavedPlanId, setActiveSavedPlanId] = useState<string | null>(
    null,
  );
  const [specimens, setSpecimens] = useState<SpecimenV1[]>([]);
  const [shareBanner, setShareBanner] = useState<string | null>(null);
  /** Shared/imported plan preview before (or instead of) local save. */
  const [sessionPlan, setSessionPlan] = useState<SavedPathPlan | null>(null);
  const [browseImportStatus, setBrowseImportStatus] = useState<string | null>(
    null,
  );
  const [browseImportBusy, setBrowseImportBusy] = useState(false);
  const [browseWorldChoices, setBrowseWorldChoices] = useState<
    SaveWorldCandidate[] | null
  >(null);
  const lastShareKeyRef = useRef<string | null>(null);
  const lastComboKeyRef = useRef<string | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
        setShowPet(loadShowPet());
        setSavedPlans(loadSavedPathPlans());
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

  // Hydrate canned links / chatbot share payloads when dataset or URL hash changes.
  useEffect(() => {
    if (!dataset) return;

    const applyShareFromLocation = () => {
      const sharePayload = parseShareFromLocation(
        window.location.search,
        window.location.hash,
      );

      if (sharePayload) {
        const shareKey = encodeSharePayload(sharePayload);
        if (lastShareKeyRef.current === shareKey) return;
        lastShareKeyRef.current = shareKey;
        lastComboKeyRef.current = null;

        const resolved = resolveSharePayload(dataset, sharePayload);
        setMode("path");
        setPathPlannerMode(resolved.mode);
        setIncludeTargetAsParent(resolved.includeTargetAsParent);
        setActiveSavedPlanId(null);
        setPathPairTags([]);
        setPathExcludeTags([]);
        setPathVisibleCount(MERGE_PAGE_SIZE);
        setSpecimens(resolved.specimens);

        if (resolved.mode === "merge") {
          setPathTraitA(resolved.traitA);
          setPathTraitB(resolved.traitB);
          setPathTarget(resolved.target);
          setPathStart(null);
          setWaypoints([]);
        } else {
          setPathStart(resolved.start);
          setPathTarget(resolved.target);
          setWaypoints(resolved.waypoints);
          setPathTraitA(null);
          setPathTraitB(null);
        }

        if (resolved.importedPlan) {
          setSessionPlan(resolved.importedPlan);
          setShareBanner(
            resolved.unresolved.length
              ? `Opened shared tree — could not resolve: ${resolved.unresolved.join(", ")}`
              : `Opened shared breeding tree${resolved.specimens.length ? ` with ${resolved.specimens.length} injected pal${resolved.specimens.length === 1 ? "" : "s"}` : ""}. Save it anytime.`,
          );
        } else {
          setSessionPlan(null);
          if (resolved.unresolved.length) {
            setShareBanner(
              `Opened shared plan — could not resolve: ${resolved.unresolved.join(", ")}`,
            );
          } else if (resolved.specimens.length) {
            setShareBanner(
              `Opened shared plan with ${resolved.specimens.length} injected pal${resolved.specimens.length === 1 ? "" : "s"}.`,
            );
          } else {
            setShareBanner("Opened shared breeding plan from link.");
          }
        }
        return;
      }

      const comboPayload: ComboPayloadV1 | null = parseComboFromLocation(
        window.location.hash,
      );
      if (!comboPayload) return;

      const comboKey = encodeComboPayload(comboPayload);
      if (lastComboKeyRef.current === comboKey) return;
      lastComboKeyRef.current = comboKey;
      lastShareKeyRef.current = null;

      const openError = (msg: string) => {
        setShareBanner(msg);
        setSessionPlan(null);
        setActiveSavedPlanId(null);
      };

      if (comboPayload.mode === "child") {
        const aPal = resolvePalName(dataset, comboPayload.a);
        const bPal = resolvePalName(dataset, comboPayload.b);
        if (!aPal || !bPal) {
          openError(
            `Opened offspring link — could not resolve: ${[
              !aPal ? `a: ${comboPayload.a}` : null,
              !bPal ? `b: ${comboPayload.b}` : null,
            ]
              .filter(Boolean)
              .join(", ")}`,
          );
          return;
        }

        setMode("child");
        setParentA(aPal);
        setParentB(bPal);
        setTarget(null);
        setActiveSavedPlanId(null);
        setSessionPlan(null);
        setShareBanner("Opened offspring from link.");
        return;
      }

      // parents
      const tPal = resolvePalName(dataset, comboPayload.t);
      if (!tPal) {
        openError(`Opened parent pairs link — could not resolve: ${comboPayload.t}`);
        return;
      }

      setMode("parents");
      setTarget(tPal);
      setParentA(null);
      setParentB(null);
      setActiveSavedPlanId(null);
      setSessionPlan(null);
      setShareBanner("Opened parent pairs from link.");
    };

    applyShareFromLocation();
    window.addEventListener("hashchange", applyShareFromLocation);
    return () => window.removeEventListener("hashchange", applyShareFromLocation);
  }, [dataset]);

  // Keep the URL hash in sync with the active Parents/Offspring selection
  // so players can share a link just by copying the browser address.
  useEffect(() => {
    if (!dataset) return;

    const currentHash = window.location.hash || "";

    const setComboHash = (payload: ComboPayloadV1) => {
      const comboKey = encodeComboPayload(payload);
      const nextHash = `#combo=${comboKey}`;
      if (currentHash === nextHash) return;

      // Prevent the hashchange handler from re-applying the same combo.
      lastComboKeyRef.current = comboKey;
      lastShareKeyRef.current = null;
      window.location.hash = nextHash;
    };

    if (mode === "parents" && target) {
      setComboHash({ v: 1, mode: "parents", t: target.name });
      return;
    }

    if (mode === "child" && parentA && parentB) {
      setComboHash({ v: 1, mode: "child", a: parentA.name, b: parentB.name });
      return;
    }

    // If the user leaves the parent/child lookup views (or has an incomplete
    // selection), clear our canned link fragment.
    if (currentHash.startsWith("#combo=")) {
      const hasValidSelection =
        (mode === "parents" && Boolean(target)) ||
        (mode === "child" && Boolean(parentA && parentB));

      if (!hasValidSelection) {
        lastComboKeyRef.current = null;
        window.location.hash = "";
      }
    }
  }, [dataset, mode, target, parentA, parentB]);

  function updateTheme(next: ThemeId) {
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  }

  function updateShowPet(next: boolean) {
    setShowPet(next);
    saveShowPet(next);
  }

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
    () => ({
      ...filterOptions,
      includeTargetAsParent,
      owned: ownedSet,
      // Fresh memos per options identity — shared across merge filter + tree builds.
      pathResultCache: new Map(),
      partnerPoolCache: new Map(),
    }),
    [filterOptions, includeTargetAsParent, ownedSet],
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
    // Build a wider tip-sorted pool, then re-rank by full-tree feasibility
    // so finish-path partners (e.g. late-area pals) affect ordering.
    const poolSize = Math.min(
      filteredMergeCandidates.length,
      Math.max(100, pathVisibleCount * 10),
    );
    const built = filteredMergeCandidates.slice(0, poolSize).map((candidate) =>
      buildMergeTree(
        dataset,
        pathTraitA.index,
        pathTraitB.index,
        pathTarget.index,
        candidate,
        pathOptions,
      ),
    );
    return sortPathResultsByFeasibility(built, ownedSet).slice(
      0,
      pathVisibleCount,
    );
  }, [
    dataset,
    pathTraitA,
    pathTraitB,
    pathTarget,
    filteredMergeCandidates,
    pathVisibleCount,
    pathOptions,
    ownedSet,
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

  function clearOwned() {
    setOwned([]);
    saveOwned([]);
    setBrowseWorldChoices(null);
    setBrowseImportStatus("Cleared owned set.");
  }

  async function applyOwnedImport(file: File, sourceLabel: string) {
    if (!dataset) return;
    setBrowseImportBusy(true);
    setBrowseImportStatus(`Reading ${sourceLabel}…`);
    try {
      const result = await importOwnedFromLevelSav(dataset, file);
      setOwned(result.indexes);
      saveOwned(result.indexes);
      setBrowseWorldChoices(null);
      const unresolvedNote =
        result.unresolved.length > 0
          ? ` · ${result.unresolved.length} id${result.unresolved.length === 1 ? "" : "s"} unmatched`
          : "";
      setBrowseImportStatus(
        `Imported ${result.speciesCount} species from ${result.palCount} Pal${result.palCount === 1 ? "" : "s"} (${sourceLabel})${unresolvedNote}. Owned set replaced.`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not import Level.sav";
      setBrowseImportStatus(`Import failed — owned set unchanged. ${message}`);
    } finally {
      setBrowseImportBusy(false);
    }
  }

  async function importOwnedFromSave(file: File) {
    await applyOwnedImport(file, file.name);
  }

  function presentWorldChoices(worlds: SaveWorldCandidate[]): Promise<void> | void {
    if (worlds.length === 0) {
      setBrowseWorldChoices(null);
      setBrowseImportStatus(
        "Import failed — owned set unchanged. No Level.sav found. Choose the SaveGames folder (or a world folder that contains Level.sav).",
      );
      return;
    }
    if (worlds.length === 1) {
      const only = worlds[0]!;
      return applyOwnedImport(only.file, only.relativePath);
    }
    setBrowseWorldChoices(worlds);
    setBrowseImportStatus(
      `Found ${worlds.length} worlds — pick one to import (owned set unchanged until you choose).`,
    );
  }

  async function importOwnedFromSaveGamesFolder() {
    setBrowseImportBusy(true);
    setBrowseImportStatus("Opening SaveGames folder…");
    try {
      const handle = await pickSaveGamesDirectory();
      setBrowseImportStatus(`Scanning ${handle.name}…`);
      const worlds = await discoverWorldsFromDirectoryHandle(handle);
      // Clear scan busy before import/picker; applyOwnedImport manages its own busy flag.
      setBrowseImportBusy(false);
      await presentWorldChoices(worlds);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") {
        setBrowseImportStatus(null);
      } else {
        const message =
          err instanceof Error ? err.message : "Could not open SaveGames folder";
        setBrowseImportStatus(
          `Import failed — owned set unchanged. ${message}`,
        );
      }
      setBrowseImportBusy(false);
    }
  }

  function importOwnedFromSaveGamesFileList(files: FileList) {
    void presentWorldChoices(discoverWorldsFromFileList(files));
  }

  function chooseBrowseWorld(world: SaveWorldCandidate) {
    void applyOwnedImport(world.file, world.relativePath);
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

  const activeSavedPlan = useMemo(() => {
    if (sessionPlan) return sessionPlan;
    return savedPlans.find((plan) => plan.id === activeSavedPlanId) ?? null;
  }, [sessionPlan, savedPlans, activeSavedPlanId]);

  function palByIndex(index: number | undefined): Pal | null {
    if (index == null || !dataset) return null;
    return dataset.pals[index] ?? null;
  }

  function savePathPlan(path: PathResult): boolean {
    const suggested = defaultPlanName(path, pathPlannerMode, {
      traitA: pathTraitA?.name,
      traitB: pathTraitB?.name,
      target: pathTarget?.name,
      start: pathStart?.name,
    });
    const name = window.prompt("Name this breeding plan", suggested);
    if (name == null) return false;
    const trimmed = name.trim() || suggested;
    const planSpecimens = specimens.length ? specimens : undefined;
    const plan: SavedPathPlan = {
      id: createSavedPathPlanId(),
      name: trimmed,
      savedAt: Date.now(),
      plannerMode: pathPlannerMode,
      pathTraitA: pathTraitA?.index,
      pathTraitB: pathTraitB?.index,
      pathTarget: pathTarget?.index,
      pathStart: pathStart?.index,
      waypoints: waypoints.map((w) => w.index),
      includeTargetAsParent,
      result: snapshotPathResult(path),
      completedStepKeys: [],
      specimens: planSpecimens,
      tree: treeForShare(null, path, planSpecimens),
      source: planSpecimens?.length ? "share" : "local",
    };
    const next = upsertSavedPathPlan(plan);
    setSavedPlans(next);
    setSessionPlan(null);
    setActiveSavedPlanId(plan.id);
    return true;
  }

  function saveActivePlan(): boolean {
    const plan = activeSavedPlan;
    if (!plan) return false;
    const name = window.prompt("Name this breeding plan", plan.name);
    if (name == null) return false;
    const trimmed = name.trim() || plan.name;
    const planSpecimens = plan.specimens?.length
      ? plan.specimens
      : specimens.length
        ? specimens
        : undefined;
    const toSave: SavedPathPlan = {
      ...plan,
      id:
        plan.source === "share" && plan.id.startsWith("shared-")
          ? createSavedPathPlanId()
          : plan.id,
      name: trimmed,
      savedAt: Date.now(),
      specimens: planSpecimens,
      tree: plan.tree ?? treeForShare(plan, null, planSpecimens),
      source: plan.source ?? "local",
    };
    const next = upsertSavedPathPlan(toSave);
    setSavedPlans(next);
    setSessionPlan(null);
    setActiveSavedPlanId(toSave.id);
    setSpecimens(toSave.specimens ?? []);
    setShareBanner(null);
    return true;
  }

  function copyShareLink(): boolean {
    const plan = activeSavedPlan;
    const tree = treeForShare(plan, null, specimens);
    const payload = sharePayloadFromPlanner({
      mode: plan?.plannerMode ?? pathPlannerMode,
      traitA: plan ? palByIndex(plan.pathTraitA) : pathTraitA,
      traitB: plan ? palByIndex(plan.pathTraitB) : pathTraitB,
      start: plan ? palByIndex(plan.pathStart) : pathStart,
      target: plan ? palByIndex(plan.pathTarget) : pathTarget,
      waypoints: plan
        ? (plan.waypoints ?? [])
            .map((i) => palByIndex(i))
            .filter((p): p is Pal => p != null)
        : waypoints,
      includeTargetAsParent: plan
        ? Boolean(plan.includeTargetAsParent)
        : includeTargetAsParent,
      specimens: plan?.specimens?.length ? plan.specimens : specimens,
      tree,
      name: plan?.name,
    });
    if (!payload) {
      window.alert("Pick a complete path setup before copying a share link.");
      return false;
    }
    const url = buildViewUrl(payload);
    void navigator.clipboard.writeText(url);
    return true;
  }

  function openSavedPlan(plan: SavedPathPlan) {
    setSessionPlan(null);
    setMode("path");
    setPathPlannerMode(plan.plannerMode);
    setIncludeTargetAsParent(Boolean(plan.includeTargetAsParent));
    setPathPairTags([]);
    setPathExcludeTags([]);
    setPathVisibleCount(MERGE_PAGE_SIZE);
    setSpecimens(plan.specimens ?? []);

    if (plan.plannerMode === "chain") {
      setPathStart(palByIndex(plan.pathStart));
      setPathTarget(palByIndex(plan.pathTarget));
      setWaypoints(
        (plan.waypoints ?? [])
          .map((index) => palByIndex(index))
          .filter((pal): pal is Pal => pal != null),
      );
      setPathTraitA(null);
      setPathTraitB(null);
    } else {
      setPathTraitA(palByIndex(plan.pathTraitA));
      setPathTraitB(palByIndex(plan.pathTraitB));
      setPathTarget(palByIndex(plan.pathTarget));
      setPathStart(null);
      setWaypoints([]);
    }

    setActiveSavedPlanId(plan.id);
  }

  function clearActivePlanView() {
    setActiveSavedPlanId(null);
    setSessionPlan(null);
  }

  function removeSavedPlan(id: string) {
    const next = deleteSavedPathPlan(id);
    setSavedPlans(next);
    if (activeSavedPlanId === id) setActiveSavedPlanId(null);
    if (sessionPlan?.id === id) setSessionPlan(null);
  }

  function toggleSavedStep(stepKey: string, completed: boolean) {
    if (sessionPlan) {
      const keys = new Set(sessionPlan.completedStepKeys);
      if (completed) keys.add(stepKey);
      else keys.delete(stepKey);
      setSessionPlan({ ...sessionPlan, completedStepKeys: [...keys] });
      return;
    }
    if (!activeSavedPlanId) return;
    const plan = savedPlans.find((p) => p.id === activeSavedPlanId);
    if (!plan) return;
    const keys = new Set(plan.completedStepKeys);
    if (completed) keys.add(stepKey);
    else keys.delete(stepKey);
    const next = updateSavedPathProgress(activeSavedPlanId, [...keys]);
    setSavedPlans(next);
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />
      {showPet ? <ThemePet theme={theme} /> : null}
      <header className="hero">
        <div className="hero-top">
          <p className="brand">Pal Trait Calculator</p>
          <SettingsGearButton
            open={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
        <h1 className="headline">Find the pair. Hatch the Pal.</h1>
        <p className="lede">
          Plan trait routes by merging two parents — or look up combos, children,
          and owned-box waves.
        </p>
      </header>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={updateTheme}
        showPet={showPet}
        onShowPetChange={updateShowPet}
        savedPlans={savedPlans}
        activeSavedPlanId={activeSavedPlanId}
        onOpenSavedPlan={openSavedPlan}
        onDeleteSavedPlan={removeSavedPlan}
      />

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
                    saveTheme(theme);
                    saveShowPet(showPet);
                  }}
                >
                  Save preferences
                </button>
              </div>
            </div>

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
                activeSavedPlan={activeSavedPlan}
                onSavePath={savePathPlan}
                onSaveActivePlan={saveActivePlan}
                onCopyShareLink={copyShareLink}
                onToggleSavedStep={toggleSavedStep}
                onClearActiveSavedPlan={clearActivePlanView}
                specimens={specimens}
                shareBanner={shareBanner}
                onDismissShareBanner={() => setShareBanner(null)}
                resolveSpecimenPal={(species) =>
                  dataset ? resolvePalName(dataset, species) : null
                }
                ownedResult={ownedResult}
                browsePals={browsePals}
                owned={ownedSet}
                onToggleOwned={toggleOwned}
                onClearOwned={clearOwned}
                onImportOwnedFromSave={importOwnedFromSave}
                onImportOwnedFromSaveGamesFolder={
                  supportsSaveGamesFolderPicker()
                    ? importOwnedFromSaveGamesFolder
                    : undefined
                }
                onImportOwnedFromSaveGamesFiles={importOwnedFromSaveGamesFileList}
                browseWorldChoices={browseWorldChoices}
                onChooseBrowseWorld={chooseBrowseWorld}
                onDismissBrowseWorldChoices={() => setBrowseWorldChoices(null)}
                browseImportStatus={browseImportStatus}
                browseImportBusy={browseImportBusy}
                onDismissBrowseImportStatus={() => setBrowseImportStatus(null)}
              />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
