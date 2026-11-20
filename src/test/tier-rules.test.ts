import { describe, it, expect } from "vitest";
import {
  flatRules, tierRulesFromRow, parseTierRules, isBagSize, ratesFor, describeRules, volumeNudge, formatNudge,
  type TierRules,
} from "@/lib/tierRules";
import { computeOrderBreakdown, storedOrderBreakdown, recalcOrderFromItems, type PricedCoffeeLine } from "@/lib/pricing";

const AMULETTE: TierRules = { kg: 5, bag: 5, thresholdKg: 20, kgAbove: 10 };
const kgLine = (price: number, kg: number): PricedCoffeeLine => ({ pricePerKg: price, quantityKg: kg, vatRate: 5.5 });
const bagLine = (price: number, kg: number): PricedCoffeeLine => ({ pricePerKg: price, quantityKg: kg, vatRate: 5.5, isBag: true });
const auto = { kind: "auto" as const, free: false };

describe("volume step", () => {
  it("AMULETTE below the step", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [kgLine(26.5, 19.75), bagLine(38, 1)], rules: AMULETTE, delivery: auto,
    });
    expect(b.coffee.lineRates).toEqual([5, 5]);
    expect(b.coffee.discounts).toEqual([
      { kind: "kg", percent: 5, discountHT: expect.any(Number) },
      { kind: "bag", percent: 5, discountHT: expect.any(Number) },
    ]);
  });
  it("AMULETTE at the step is inclusive", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [kgLine(26.5, 20), bagLine(38, 1)], rules: AMULETTE, delivery: auto,
    });
    expect(b.coffee.lineRates).toEqual([10, 5]);
    expect(b.coffee.discountPercent).toBe(10);
  });
  it("bags never count toward the step", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [kgLine(26.5, 16), bagLine(38, 5)], rules: AMULETTE, delivery: auto,
    });
    expect(b.coffee.lineRates).toEqual([5, 5]);
  });
  it("1 kg and 3 kg packs count as by the kg", () => {
    expect(isBagSize(1)).toBe(false);
    expect(isBagSize(3)).toBe(false);
    expect(isBagSize(0.25)).toBe(true);
    expect(isBagSize(0.15)).toBe(true);
    expect(isBagSize(null)).toBe(false);
    expect(ratesFor(AMULETTE, 20)).toEqual({ kg: 10, bag: 5 });
  });
  it("coffee.discountPercent falls back to the bag rate when there are only bags", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [bagLine(38, 1)], rules: { kg: 5, bag: 7, thresholdKg: null, kgAbove: null }, delivery: auto,
    });
    expect(b.coffee.discountPercent).toBe(7);
    expect(b.coffee.discounts.map((d) => d.kind)).toEqual(["bag"]);
  });
  it("discounts omit rates of 0", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [kgLine(26.5, 5), bagLine(38, 1)], rules: { kg: 0, bag: 5, thresholdKg: null, kgAbove: null }, delivery: auto,
    });
    expect(b.coffee.discounts.map((d) => d.kind)).toEqual(["bag"]);
  });
});

describe("flat tiers equal today", () => {
  const cases = [
    { name: "A'", p: 5, lines: [kgLine(26.5, 30), kgLine(28, 3)], free: false, ht: 850.2, ttc: 899.14 },
    { name: "A", p: 5, lines: [kgLine(26.5, 30)], free: false, ht: 767.4, ttc: 811.35 },
    { name: "B", p: 15, lines: [bagLine(38, 0.25), kgLine(26.5, 10)], free: false, ht: 245.38, ttc: 260.62 },
    { name: "C", p: 5, lines: [kgLine(26.5, 5)], free: true, ht: 125.9, ttc: 132.82 },
  ];
  it.each(cases)("order $name", ({ p, lines, free, ht, ttc }) => {
    const delivery = { kind: "auto" as const, free };
    const old = computeOrderBreakdown({ coffeeLines: lines, discountPercent: p, delivery });
    const rules = computeOrderBreakdown({ coffeeLines: lines, rules: flatRules(p), delivery });
    expect(old.totalHT).toBe(ht);
    expect(old.totalTTC).toBe(ttc);
    expect(rules.totalHT).toBe(ht);
    expect(rules.totalTTC).toBe(ttc);
    expect(rules.coffee.discountHT).toBe(old.coffee.discountHT);
  });
  it("stored and recalc accept rules or a number", () => {
    const items = [{ quantity: 30, price_per_kg: 26.5, size_kg: null }, { quantity: 1, price_per_kg: 38, size_kg: 0.25 }];
    expect(storedOrderBreakdown(items, flatRules(5)).totalHT).toBe(storedOrderBreakdown(items, 5).totalHT);
    const r = recalcOrderFromItems({ items, rules: AMULETTE, free: false });
    expect(r.lineRates).toEqual([10, 5]);
    const r2 = recalcOrderFromItems({ items, discountPercent: 5, free: false });
    expect(r2.lineRates).toEqual([5, 5]);
  });
});

describe("describeRules", () => {
  it("formats the summary", () => {
    expect(describeRules(AMULETTE)).toBe("café au kg −5 % · dès 20 kg −10 % · sachets −5 %");
    expect(describeRules(flatRules(10))).toBe("café au kg −10 % · sachets −10 %");
    expect(describeRules(flatRules(0))).toBeNull();
  });
});

describe("volumeNudge", () => {
  it("nudges toward the step", () => {
    const n = volumeNudge(AMULETTE, 18.5)!;
    expect(n).toEqual({ kind: "remaining", kg: 1.5, percent: 10 });
    expect(formatNudge(n)).toBe("Plus que 1,5 kg pour passer à −10 %");
    expect(formatNudge(volumeNudge(AMULETTE, 20)!)).toBe("Remise −10 % atteinte");
    expect(volumeNudge(flatRules(5), 10)).toBeNull();
    expect(volumeNudge(AMULETTE, 0)).toBeNull();
  });
});

describe("parsing", () => {
  it("legacy row becomes flat", () => {
    expect(tierRulesFromRow({ product_discount_percent: 10 })).toEqual(flatRules(10));
    expect(tierRulesFromRow({ product_discount_percent: "10" })).toEqual(flatRules(10));
    expect(tierRulesFromRow(null)).toEqual(flatRules(0));
  });
  it("new row", () => {
    expect(tierRulesFromRow({
      kg_discount_percent: "5", bag_discount_percent: 5, volume_threshold_kg: "20", volume_kg_discount_percent: 10, product_discount_percent: 5,
    })).toEqual(AMULETTE);
  });
  it("parseTierRules", () => {
    expect(parseTierRules("x")).toBeNull();
    expect(parseTierRules(null)).toBeNull();
    expect(parseTierRules({ kg: 5, bag: 5, thresholdKg: 20, kgAbove: 10 })).toEqual(AMULETTE);
  });
});
