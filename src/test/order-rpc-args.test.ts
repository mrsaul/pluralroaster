import { describe, it, expect } from "vitest";
import { buildOrderRpcArgs } from "@/lib/orderRpcArgs";
import { computeOrderBreakdown, cartToCoffeeLines } from "@/lib/pricing";
import { buildClientSnapshot, cartItemsToSnapshotItems } from "@/lib/clientSnapshot";
import type { CartItem, Product } from "@/lib/store";
import type { TierRules } from "@/lib/tierRules";

const product: Product = {
  id: "p1", name: "Colombia", origin: "CO", sku: "COL-1", pricePerKg: 28,
  roastLevel: "medium", available: true, vatRate: 5.5,
};
const AMULETTE: TierRules = { kg: 5, bag: 5, thresholdKg: 20, kgAbove: 10 };
const items: CartItem[] = [
  { product, quantity: 22 },
  { product, quantity: 4, sizeLabel: "250 g", sizeKg: 0.25, unitPrice: 7 },
];

function snap(its: CartItem[], rules: TierRules) {
  const breakdown = computeOrderBreakdown({
    coffeeLines: cartToCoffeeLines(its), rules, delivery: { kind: "auto", free: false },
  });
  return buildClientSnapshot({
    items: cartItemsToSnapshotItems(its), breakdown, deliveryDate: "2026-12-01", notes: null,
    discountPercent: breakdown.coffee.discountPercent, source: "client",
  });
}

describe("buildOrderRpcArgs", () => {
  it("zips per-line rates with items in order", () => {
    const a = buildOrderRpcArgs({ items, snapshot: snap(items, AMULETTE), tier: { name: "AMULETTE", rules: AMULETTE } });
    expect(a.p_items.map((i) => i.line_discount_percent)).toEqual([10, 5]);
    expect(a.p_items[1].quantity).toBe(1);
    expect(a.p_items[1].size_kg).toBe(0.25);
    expect(a.p_pricing_rules).toEqual(AMULETTE);
    expect(a.p_pricing_tier_name).toBe("AMULETTE");
    expect(a.p_discount_percent).toBe(10);
  });
  it("sends no rules or tier name without a tier", () => {
    const a = buildOrderRpcArgs({ items, snapshot: snap(items, { kg: 0, bag: 0, thresholdKg: null, kgAbove: null }), tier: null });
    expect("p_pricing_rules" in a).toBe(false);
    expect("p_pricing_tier_name" in a).toBe(false);
  });
  it("sends no tier name when this order has no discount", () => {
    const zero: TierRules = { kg: 0, bag: 0, thresholdKg: null, kgAbove: null };
    const a = buildOrderRpcArgs({ items, snapshot: snap(items, zero), tier: { name: "T", rules: zero } });
    expect("p_pricing_tier_name" in a).toBe(false);
    expect(a.p_pricing_rules).toEqual(zero);
  });
  it("throws when rates and items are misaligned", () => {
    expect(() =>
      buildOrderRpcArgs({ items: [items[0]], snapshot: snap(items, AMULETTE), tier: null }),
    ).toThrow();
  });
});
