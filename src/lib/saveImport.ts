import type { BreedingDataset } from "./types";

const WASM_URL = "/wasm/palworld_save_parser.wasm";

type WasmExports = {
  memory: WebAssembly.Memory;
  alloc: (size: number) => number;
  parse_sav: (ptr: number, len: number) => number;
  free_string: (ptr: number) => void;
  parser_version: () => number;
};

type ParsedSavePal = {
  character_id?: string;
  is_player?: boolean;
};

type ParsedSaveResult = {
  error?: string;
  pal_count?: number;
  total_characters?: number;
  pals?: ParsedSavePal[];
  warnings?: string[];
};

export type LevelSavParseResult = {
  characterIds: string[];
  palCount: number;
  warnings: string[];
};

export type OwnedImportResult = {
  indexes: number[];
  unresolved: string[];
  palCount: number;
  speciesCount: number;
  warnings: string[];
};

/** One Level.sav found under a SaveGames (or world) folder. */
export type SaveWorldCandidate = {
  id: string;
  /** Short label for the picker (usually world folder name). */
  label: string;
  /** Path-ish hint under the chosen folder. */
  relativePath: string;
  file: File;
  modifiedAt: number | null;
};

type FsDirHandle = {
  kind: "directory";
  name: string;
  values: () => AsyncIterableIterator<
    | { kind: "file"; name: string; getFile: () => Promise<File> }
    | FsDirHandle
  >;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
    }) => Promise<FsDirHandle>;
  }
}

let wasm: WasmExports | null = null;
let initPromise: Promise<void> | null = null;

/** Lazy-load the vendored WASM Level.sav parser (first import only). */
export function initSaveParser(wasmUrl = WASM_URL): Promise<void> {
  if (wasm) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Failed to load save parser (${response.status})`);
    }
    const bytes = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, { env: {} });
    wasm = result.instance.exports as unknown as WasmExports;
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

function readCString(ptr: number): string {
  if (!wasm) return "";
  const buf = new Uint8Array(wasm.memory.buffer);
  const chars: number[] = [];
  let i = ptr;
  while (i < buf.length && buf[i] !== 0) {
    chars.push(buf[i]!);
    i++;
  }
  return new TextDecoder().decode(new Uint8Array(chars));
}

/**
 * Parse a Steam Palworld Level.sav in the browser.
 * Does not upload the file anywhere.
 */
export async function parseLevelSav(file: File): Promise<LevelSavParseResult> {
  await initSaveParser();
  if (!wasm) throw new Error("Save parser failed to initialize");

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new Error("Empty file — pick a Level.sav from your world folder");
  }

  const inputPtr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, inputPtr, bytes.length).set(bytes);

  const resultPtr = wasm.parse_sav(inputPtr, bytes.length);
  const jsonStr = readCString(resultPtr);
  wasm.free_string(resultPtr);

  let parsed: ParsedSaveResult;
  try {
    parsed = JSON.parse(jsonStr) as ParsedSaveResult;
  } catch {
    throw new Error("Could not read parser output from Level.sav");
  }

  if (parsed.error) {
    throw new Error(String(parsed.error));
  }

  const pals = Array.isArray(parsed.pals) ? parsed.pals : [];
  const characterIds = pals
    .filter((p) => !p.is_player)
    .map((p) => (typeof p.character_id === "string" ? p.character_id.trim() : ""))
    .filter(Boolean);

  if (characterIds.length === 0) {
    throw new Error(
      "No Pals found in that file. Upload Level.sav from your world folder (not Players/*.sav).",
    );
  }

  return {
    characterIds,
    palCount: typeof parsed.pal_count === "number" ? parsed.pal_count : characterIds.length,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w): w is string => typeof w === "string")
      : [],
  };
}

/** Candidate CharacterID forms to try against dataset.byInternalName. */
export function characterIdCandidates(raw: string): string[] {
  const id = raw.trim();
  if (!id) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };

  push(id);

  let stripped = id;
  // Boss / raid / gym wrappers often prefix the real species id.
  stripped = stripped.replace(/^(Boss_|BOSS_|Gym_|GYM_|RAID_)/i, "");
  push(stripped);

  // Some instances append gender or size suffixes.
  const noGender = stripped.replace(/_(Male|Female|M|F)$/i, "");
  push(noGender);

  const noSize = noGender.replace(/_(Small|Big|Large)$/i, "");
  push(noSize);

  return out;
}

/**
 * Map save CharacterIDs to breeding-dataset Pal indexes.
 * Unresolved IDs are reported but do not block a partial success.
 */
export function ownedIndexesFromCharacterIds(
  dataset: BreedingDataset,
  characterIds: string[],
): { indexes: number[]; unresolved: string[]; speciesCount: number } {
  const indexes = new Set<number>();
  const unresolved = new Set<string>();

  for (const raw of characterIds) {
    let matched = false;
    for (const candidate of characterIdCandidates(raw)) {
      const pal = dataset.byInternalName.get(candidate);
      if (pal) {
        indexes.add(pal.index);
        matched = true;
        break;
      }
    }
    if (!matched) unresolved.add(raw);
  }

  return {
    indexes: [...indexes].sort((a, b) => a - b),
    unresolved: [...unresolved].sort((a, b) => a.localeCompare(b)),
    speciesCount: indexes.size,
  };
}

/**
 * Full import pipeline: parse Level.sav → unique owned indexes.
 * Throws on hard failures (bad file / no pals). Callers must not
 * replace owned state unless this resolves.
 */
export async function importOwnedFromLevelSav(
  dataset: BreedingDataset,
  file: File,
): Promise<OwnedImportResult> {
  const parsed = await parseLevelSav(file);
  const mapped = ownedIndexesFromCharacterIds(dataset, parsed.characterIds);

  if (mapped.indexes.length === 0) {
    throw new Error(
      mapped.unresolved.length
        ? `Parsed ${parsed.palCount} Pal(s) but none matched the calculator dataset.`
        : "No owned species could be resolved from that Level.sav.",
    );
  }

  return {
    indexes: mapped.indexes,
    unresolved: mapped.unresolved,
    palCount: parsed.palCount,
    speciesCount: mapped.speciesCount,
    warnings: parsed.warnings,
  };
}

export function supportsSaveGamesFolderPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function isLevelSavName(name: string): boolean {
  return name.toLowerCase() === "level.sav";
}

function worldLabelFromPath(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  // Prefer world folder (parent of Level.sav), then SteamID, then full path.
  if (parts.length >= 2) return parts[parts.length - 2]!;
  if (parts.length === 1) return parts[0]!;
  return relativePath || "Level.sav";
}

function sortWorldCandidates(worlds: SaveWorldCandidate[]): SaveWorldCandidate[] {
  return [...worlds].sort((a, b) => {
    const am = a.modifiedAt ?? 0;
    const bm = b.modifiedAt ?? 0;
    if (am !== bm) return bm - am;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Walk a directory handle (SaveGames or a single world folder) and collect Level.sav files.
 */
export async function discoverWorldsFromDirectoryHandle(
  root: FsDirHandle,
): Promise<SaveWorldCandidate[]> {
  const found: SaveWorldCandidate[] = [];

  async function walk(dir: FsDirHandle, pathParts: string[]) {
    for await (const entry of dir.values()) {
      const nextPath = [...pathParts, entry.name];
      if (entry.kind === "file") {
        if (!isLevelSavName(entry.name)) continue;
        // Skip automatic backups nested under backup/
        if (pathParts.some((p) => p.toLowerCase() === "backup")) continue;
        const file = await entry.getFile();
        const relativePath = nextPath.join("/");
        found.push({
          id: relativePath,
          label: worldLabelFromPath(relativePath),
          relativePath,
          file,
          modifiedAt: Number.isFinite(file.lastModified) ? file.lastModified : null,
        });
      } else if (entry.kind === "directory") {
        // Cap depth: SaveGames / SteamID / world is enough; allow a bit more for servers.
        if (pathParts.length >= 5) continue;
        await walk(entry, nextPath);
      }
    }
  }

  await walk(root, []);
  return sortWorldCandidates(found);
}

/**
 * Discover Level.sav entries from a `<input webkitdirectory>` FileList.
 */
export function discoverWorldsFromFileList(files: FileList | File[]): SaveWorldCandidate[] {
  const list = Array.from(files);
  const found: SaveWorldCandidate[] = [];

  for (const file of list) {
    const relativePath =
      typeof (file as File & { webkitRelativePath?: string }).webkitRelativePath === "string" &&
      (file as File & { webkitRelativePath?: string }).webkitRelativePath
        ? (file as File & { webkitRelativePath: string }).webkitRelativePath
        : file.name;
    if (!isLevelSavName(file.name)) continue;
    const parts = relativePath.split(/[/\\]/);
    if (parts.some((p) => p.toLowerCase() === "backup")) continue;
    found.push({
      id: relativePath,
      label: worldLabelFromPath(relativePath),
      relativePath,
      file,
      modifiedAt: Number.isFinite(file.lastModified) ? file.lastModified : null,
    });
  }

  return sortWorldCandidates(found);
}

/**
 * Open the native directory picker for SaveGames (Chromium).
 * Throws AbortError when the user cancels.
 */
export async function pickSaveGamesDirectory(): Promise<FsDirHandle> {
  if (!supportsSaveGamesFolderPicker() || !window.showDirectoryPicker) {
    throw new Error(
      "This browser cannot open a folder picker. Use “Import Level.sav”, or try Chrome/Edge.",
    );
  }
  return window.showDirectoryPicker({ id: "pal-savegamess", mode: "read" });
}
