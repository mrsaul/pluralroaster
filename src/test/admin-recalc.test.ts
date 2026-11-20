import { describe, it, expect } from "vitest";
import { flatRules, orderRulesFor, type TierRules } from "@/lib/tierRules";
import {
  coffeeRateChanges,
  computeOrderBreakdown,
  deliveryRowFor,
  recalcOrderFromItems,
  storedOrderBreakdown,
  type StoredOrderItem,
} from "@/lib/pricing";

const zaia = (kg: number): StoredOrderItem => ({ kind: "coffee", quantity: kg, price_per_kg: 28, vat_rate: 5.5 });
const service = (over: Partial<StoredOrderItem> = {}): StoredOrderItem => ({
  kind: "service", quantity: 1, price_per_kg: 10, list_price: 20, line_discount_percent: 50, ...over,
});

describe("deliveryRowFor", () => {
  it("returns the Loberz row for the ZAÏA breakdown", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 28, quantityKg: 30, vatRate: 5.5 }],
      discountPercent: 10,
      delivery: { kind: "auto", free: false },
    });
    expect(deliveryRowFor(b)).toEqual({ price_per_kg: 12, list_price: 24, line_discount_percent: 50 });
  });

  it("returns null when there is no coffee", () => {
    const b = computeOrderBreakdown({ coffeeLines: [], discountPercent: 10, delivery: { kind: "auto", free: false } });
    expect(deliveryRowFor(b)).toBeNull();
  });

  it("returns a free row for free-delivery clients", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 28, quantityKg: 5, vatRate: 5.5 }],
      discountPercent: 0,
      delivery: { kind: "auto", free: true },
    });
    expect(deliveryRowFor(b)).toEqual({ price_per_kg: 0, list_price: 20, line_discount_percent: 100 });
  });
});

describe("recalcOrderFromItems", () => {
  it("moves the row from {10,20,50} to {12,24,50} when 9 kg becomes 12 kg", () => {
    const before = recalcOrderFromItems({ items: [zaia(9), service()], discountPercent: 0, free: false });
    expect(before.deliveryRow).toEqual({ price_per_kg: 10, list_price: 20, line_discount_percent: 50 });

    const after = recalcOrderFromItems({ items: [zaia(12), service()], discountPercent: 0, free: false });
    expect(after.deliveryRow).toEqual({ price_per_kg: 12, list_price: 24, line_discount_percent: 50 });
    expect(after.totalKg).toBe(12);
    expect(after.totalPrice).toBe(348); // 12 × 28 + 12
  });

  it("keeps the tier discount on coffee (ZAÏA invoice: 768 HT)", () => {
    const r = recalcOrderFromItems({ items: [zaia(30), service()], discountPercent: 10, free: false });
    expect(r.totalKg).toBe(30);
    expect(r.totalPrice).toBe(768);
    expect(r.totalPrice).toBe(r.breakdown.totalHT);
  });

  it("ignores the stored service row and recomputes it from the coffee weight", () => {
    const legacyZero = service({ price_per_kg: 0, list_price: null, line_discount_percent: null });
    const r = recalcOrderFromItems({ items: [zaia(30), legacyZero], discountPercent: 0, free: false });
    expect(r.totalKg).toBe(30);
    expect(r.deliveryRow).toEqual({ price_per_kg: 12, list_price: 24, line_discount_percent: 50 });
  });

  it("creates a row for legacy orders without one", () => {
    const r = recalcOrderFromItems({ items: [zaia(9)], discountPercent: 0, free: false });
    expect(r.deliveryRow).toEqual({ price_per_kg: 10, list_price: 20, line_discount_percent: 50 });
    expect(r.totalPrice).toBe(262);
  });

  it("drops the row and zeroes totals when all coffee is removed", () => {
    const r = recalcOrderFromItems({ items: [service()], discountPercent: 10, free: false });
    expect(r.deliveryRow).toBeNull();
    expect(r.totalKg).toBe(0);
    expect(r.totalPrice).toBe(0);
  });

  it("charges nothing for delivery when the client has free delivery", () => {
    const r = recalcOrderFromItems({ items: [zaia(9), service()], discountPercent: 0, free: true });
    expect(r.deliveryRow).toEqual({ price_per_kg: 0, list_price: 20, line_discount_percent: 100 });
    expect(r.totalPrice).toBe(252);
  });
});

describe("storedOrderBreakdown", () => {
  it("uses the stored service row", () => {
    const b = storedOrderBreakdown([zaia(30), service({ price_per_kg: 12, list_price: 24 })], 10);
    expect(b.delivery).toMatchObject({ fullPriceHT: 24, discountPercent: 50, netHT: 12 });
    expect(b.totalHT).toBe(768);
    expect(b.totalTTC).toBe(811.98);
  });

  it("has no delivery for legacy orders", () => {
    const b = storedOrderBreakdown([zaia(30)], 10);
    expect(b.delivery).toBeNull();
    expect(b.totalHT).toBe(756);
  });
});

const AMULETTE: TierRules = { kg: 5, bag: 5, thresholdKg: 20, kgAbove: 10 };
const kgLine = (kg: number, id = "k"): StoredOrderItem & { id: string } => ({ id, kind: "coffee", quantity: kg, price_per_kg: 28, vat_rate: 5.5, size_kg: null });
const bagLine = (kg: number, id = "b"): StoredOrderItem & { id: string } => ({ id, kind: "coffee", quantity: kg, price_per_kg: 28, vat_rate: 5.5, size_kg: 0.25 });

describe("admin edits with tier rules", () => {
  it("admin edit crosses the step", () => {
    const before = recalcOrderFromItems({ items: [kgLine(18), bagLine(4)], rules: AMULETTE, free: false });
    expect(before.lineRates).toEqual([5, 5]);
    const after = recalcOrderFromItems({ items: [kgLine(22), bagLine(4)], rules: AMULETTE, free: false });
    expect(after.lineRates).toEqual([10, 5]);
    expect(after.breakdown.coffee.discountPercent).toBe(10);
  });

  it("past order ignores later tier change: frozen rules win, else the flat discount", () => {
    const frozen = orderRulesFor(flatRules(10), 15);
    expect(frozen).toEqual(flatRules(10));
    const r = recalcOrderFromItems({ items: [kgLine(10)], rules: frozen, free: false });
    expect(r.lineRates).toEqual([10]);
    expect(orderRulesFor(null, 12)).toEqual(flatRules(12));
    expect(orderRulesFor({ kg: "bad" }, 12)).toEqual(flatRules(12));
  });

  it("coffeeRateChanges lists only coffee rows whose stored rate differs", () => {
    const items = [
      { ...kgLine(22, "k"), line_discount_percent: 5 },
      { ...bagLine(4, "b"), line_discount_percent: 5 },
      { ...service(), id: "s" },
      { ...kgLine(1, "legacy"), line_discount_percent: null },
    ];
    const rates = recalcOrderFromItems({ items, rules: AMULETTE, free: false }).lineRates;
    expect(rates).toEqual([10, 5, 10]);
    expect(coffeeRateChanges(items, rates)).toEqual([
      { id: "k", rate: 10 },
      { id: "legacy", rate: 10 },
    ]);
  });
});
