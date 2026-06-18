import { describe, it, expect } from "vitest";

// Inline helpers — same logic that will live in ProductCard
const BAG_TAG = "sachet-3kg";
const BAG_KG = 3;

function isBagProduct(tags?: string[]): boolean {
  return tags?.includes(BAG_TAG) ?? false;
}

function bagLabel(totalKg: number): string {
  if (totalKg === 0) return "—";
  const bags = totalKg / BAG_KG;
  return `${bags} sac${bags > 1 ? "s" : ""}`;
}

describe("bag display helpers", () => {
  it("detects sachet-3kg tag", () => {
    expect(isBagProduct(["sachet-3kg", "origin-bresil"])).toBe(true);
  });

  it("returns false when tag absent", () => {
    expect(isBagProduct(["origin-bresil"])).toBe(false);
    expect(isBagProduct(undefined)).toBe(false);
  });

  it("shows singular for 1 bag (3 kg)", () => {
    expect(bagLabel(3)).toBe("1 sac");
  });

  it("shows plural for multiple bags", () => {
    expect(bagLabel(30)).toBe("10 sacs");
    expect(bagLabel(6)).toBe("2 sacs");
  });

  it("shows — for zero", () => {
    expect(bagLabel(0)).toBe("—");
  });
});
