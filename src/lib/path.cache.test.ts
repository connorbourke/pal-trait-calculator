import { describe, expect, it } from "vitest";
import { assembleDataset } from "./breeding";
import { findShortestPath, type PathOptions } from "./path";
import type { Combo, Pal } from "./types";

function tinyDataset() {
  const pals: Pal[] = [0, 1, 2].map((index) => ({
    index,
    internalName: `P${index}`,
    name: `Pal${index}`,
    dexNo: index,
    isVariant: false,
    dex: String(index),
    breedingPower: 1000 - index,
    rarity: 1,
    difficulty: "early",
    minWildLevel: 1,
    maxWildLevel: 10,
    minAlphaLevel: null,
    acquisitionKind: "wild",
    price: null,
    nocturnal: false,
    isTerraria: false,
    isWorldTreeLocked: false,
    isWorldTreeBreedable: false,
    work: [],
  }));

  const combos: Combo[] = [
    [0, 1, 2],
    [1, 0, 2],
    [0, 0, 0],
    [1, 1, 1],
    [2, 2, 2],
  ];

  const byParent: number[][] = [[], [], []];
  const byChild: number[][] = [[], [], []];
  combos.forEach((c, i) => {
    byParent[c[0]].push(i);
    if (c[0] !== c[1]) byParent[c[1]].push(i);
    byChild[c[2]].push(i);
  });

  const minStepEdges: [number, number, number][] = [
    [0, 2, 1],
    [1, 2, 1],
    [2, 0, 1],
    [2, 1, 1],
  ];

  return assembleDataset({
    meta: {
      project: "test",
      release: "test",
      publishedAt: "",
      note: "",
      urls: { release: "", db: "", breeding: "" },
      dbVersion: "test",
      palCount: 3,
      comboCount: combos.length,
      trending: [],
      gameTarget: { minimum: "", preferred: "", alignmentNote: "" },
      features: {},
    },
    pals,
    combos,
    byChild,
    byParent,
    specialGenders: [],
    mutationPassives: [],
    minStepEdges,
  });
}

describe("findShortestPath cache", () => {
  it("returns the same PathResult reference on cache hit", () => {
    const dataset = tinyDataset();
    const options: PathOptions = {
      pathResultCache: new Map(),
      partnerPoolCache: new Map(),
    };
    const first = findShortestPath(dataset, 0, 2, options, "finish");
    const second = findShortestPath(dataset, 0, 2, options, "finish");
    expect(first.unreachable).toBe(false);
    expect(first.totalBreeds).toBe(1);
    expect(second).toBe(first);
    expect(options.pathResultCache?.size).toBeGreaterThan(0);
  });

  it("does not reuse results across different roles", () => {
    const dataset = tinyDataset();
    const options: PathOptions = {
      pathResultCache: new Map(),
      partnerPoolCache: new Map(),
    };
    const finish = findShortestPath(dataset, 0, 2, options, "finish");
    const branch = findShortestPath(dataset, 0, 2, options, "branch-a");
    expect(finish).not.toBe(branch);
    expect(finish.steps[0]?.role).toBe("finish");
    expect(branch.steps[0]?.role).toBe("branch-a");
  });
});
