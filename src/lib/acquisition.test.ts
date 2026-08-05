import { describe, expect, it } from "vitest";
import {
  attachAcquisitionCosts,
  compareAcquisitionStats,
  computeAcquisitionCost,
  formatAcquisitionHint,
  palAcquisitionCost,
  acquisitionStats,
} from "./acquisition";
import type { AcquisitionKind, Difficulty, Pal } from "./types";

function stubPal(partial: Partial<Pal> & Pick<Pal, "name" | "index">): Pal {
  const pal: Pal = {
    index: partial.index,
    internalName: partial.internalName ?? partial.name,
    name: partial.name,
    dexNo: partial.dexNo ?? partial.index,
    isVariant: partial.isVariant ?? false,
    dex: partial.dex ?? String(partial.index),
    breedingPower: partial.breedingPower ?? 1000,
    rarity: partial.rarity ?? 5,
    difficulty: (partial.difficulty ?? "mid") as Difficulty,
    minWildLevel: partial.minWildLevel ?? null,
    maxWildLevel: partial.maxWildLevel ?? null,
    typicalWildLevel: partial.typicalWildLevel ?? null,
    minAlphaLevel: partial.minAlphaLevel ?? null,
    acquisitionKind: (partial.acquisitionKind ?? "wild") as AcquisitionKind,
    price: partial.price ?? null,
    nocturnal: partial.nocturnal ?? false,
    isTerraria: partial.isTerraria ?? false,
    isWorldTreeLocked: partial.isWorldTreeLocked ?? false,
    isWorldTreeBreedable: partial.isWorldTreeBreedable ?? false,
    work: partial.work ?? [],
  };
  return pal;
}

describe("acquisition scoring", () => {
  it("uses min-weighted wild midpoint when typical is absent", () => {
    const blazamut = stubPal({
      name: "Blazamut",
      index: 1,
      minWildLevel: 46,
      maxWildLevel: 80,
      rarity: 9,
    });
    expect(computeAcquisitionCost(blazamut)).toBe(58);
  });

  it("prefers typicalWildLevel over dump band midpoint", () => {
    const frostplume = stubPal({
      name: "Frostplume",
      index: 10,
      minWildLevel: 39,
      maxWildLevel: 68,
      typicalWildLevel: 57,
      rarity: 4,
    });
    expect(computeAcquisitionCost(frostplume)).toBe(57);
  });

  it("scores curated raid Xenolord above wild Blazamut", () => {
    const xenolord = stubPal({
      name: "Xenolord",
      index: 2,
      minWildLevel: 70,
      maxWildLevel: 70,
      rarity: 8,
      acquisitionKind: "raid",
    });
    const blazamut = stubPal({
      name: "Blazamut",
      index: 1,
      minWildLevel: 46,
      maxWildLevel: 80,
      rarity: 9,
    });
    expect(computeAcquisitionCost(xenolord)).toBe(70);
    expect(computeAcquisitionCost(xenolord)).toBeGreaterThan(
      computeAcquisitionCost(blazamut),
    );
  });

  it("scores Selyne meteor override near 65, not dump 76–80", () => {
    const selyne = stubPal({
      name: "Selyne",
      index: 3,
      minWildLevel: 65,
      maxWildLevel: 65,
      rarity: 9,
      acquisitionKind: "meteor",
    });
    expect(computeAcquisitionCost(selyne)).toBe(65);
  });

  it("bumps wild legendaries by +5, not raid legendaries", () => {
    const frostallion = stubPal({
      name: "Frostallion",
      index: 20,
      minWildLevel: 60,
      maxWildLevel: 60,
      typicalWildLevel: 60,
      rarity: 20,
      acquisitionKind: "wild",
    });
    const bellanoir = stubPal({
      name: "Bellanoir",
      index: 21,
      minWildLevel: 40,
      maxWildLevel: 40,
      typicalWildLevel: 40,
      rarity: 20,
      acquisitionKind: "raid",
    });
    expect(computeAcquisitionCost(frostallion)).toBe(65);
    expect(computeAcquisitionCost(bellanoir)).toBe(40);
    attachAcquisitionCosts([frostallion]);
    expect(
      formatAcquisitionHint(acquisitionStats([frostallion])),
    ).toBe("Hardest catch ~Lv 65 (Frostallion)");
  });

  it("bumps World Tree breedable partners", () => {
    const flaracle = stubPal({
      name: "Flaracle",
      index: 4,
      minWildLevel: 65,
      maxWildLevel: 80,
      rarity: 7,
      isWorldTreeBreedable: true,
      acquisitionKind: "worldTree",
    });
    expect(computeAcquisitionCost(flaracle)).toBe(70 + 25);
  });

  it("caches acquisitionCost via attachAcquisitionCosts", () => {
    const pal = stubPal({
      name: "Cattiva",
      index: 5,
      minWildLevel: 1,
      maxWildLevel: 20,
      rarity: 1,
    });
    attachAcquisitionCosts([pal]);
    expect(pal.acquisitionCost).toBe(8);
    expect(palAcquisitionCost(pal)).toBe(8);
    // Stale cache wins until recomputed — documents the contract
    pal.minWildLevel = 50;
    pal.maxWildLevel = 50;
    expect(palAcquisitionCost(pal)).toBe(8);
    attachAcquisitionCosts([pal]);
    expect(palAcquisitionCost(pal)).toBe(50);
  });

  it("ranks parent pairs by harder acquisition first", () => {
    const easy = acquisitionStats([
      stubPal({ name: "Lamball", index: 1, minWildLevel: 1, maxWildLevel: 20 }),
      stubPal({ name: "Cattiva", index: 2, minWildLevel: 1, maxWildLevel: 20 }),
    ]);
    const hard = acquisitionStats([
      stubPal({ name: "Lamball", index: 1, minWildLevel: 1, maxWildLevel: 20 }),
      stubPal({
        name: "Xenolord",
        index: 3,
        minWildLevel: 70,
        maxWildLevel: 70,
        acquisitionKind: "raid",
      }),
    ]);
    expect(compareAcquisitionStats(easy, hard)).toBeLessThan(0);
  });
});
