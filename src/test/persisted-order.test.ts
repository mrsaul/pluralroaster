import { describe, expect, it } from "vitest";
import { mapPersistedOrder, type PersistedOrderRow } from "@/lib/persistedOrder";
import { orderToBreakdown } from "@/lib/pricing";

const product = {
  id: "p1", name: "Colombia", origin: "Colombia", sku: "COL", price_per_kg: 40,
  roast_level: "medium", is_active: true, sellsy_tax_rate: 5.5,
};

const baseRow = (over: Partial<PersistedOrderRow> = {}): PersistedOrderRow => ({
  id: "o1", delivery_date: "2026-12-01", total_kg: 2, total_price: 100, status: "pending",
  sellsy_id: null, created_at: "2026-11-20", notes: null, reordered_from: null,
  delivery_address_id: null, discount_percent: 0, pricing_rules: null,
  order_items: [
    { quantity: 1, price_per_kg: 38, size_label: "250g", size_kg: 0.25, product_name: "Colombia", product_sku: "COL", product_id: "p1", products: product },
    { quantity: 1, price_per_kg: 40, size_label: null, size_kg: null, product_name: "Colombia", product_sku: "COL", product_id: "p1", products: product },
  ],
  ...over,
});

describe("mapPersistedOrder bags", () => {
  it("reorder keeps bags as bags", () => {
    const o = mapPersistedOrder(baseRow());
    expect(o.items[0]).toMatchObject({ quantity: 4, sizeLabel: "250g", sizeKg: 0.25, unitPrice: 9.5 });
    expect(o.coffeeLines[0].isBag).toBe(true);
    expect(o.coffeeLines[0].quantityKg).toBe(1);
  });

  it("kg rows are unchanged", () => {
    const o = mapPersistedOrder(baseRow());
    expect(o.items[1].quantity).toBe(1);
    expect(o.items[1].sizeKg).toBeUndefined();
    expect(o.items[1].unitPrice).toBeUndefined();
    expect(o.coffeeLines[1].isBag).toBeFalsy();
  });

  it("maps pricing_rules, malformed to null", () => {
    const rules = { kg: 10, bag: 5, thresholdKg: 20, kgAbove: 15 };
    expect(mapPersistedOrder(baseRow({ pricing_rules: rules })).pricingRules).toBeTruthy();
    expect(mapPersistedOrder(baseRow({ pricing_rules: { nope: 1 } })).pricingRules).toBeNull();
    expect(mapPersistedOrder(baseRow({ pricing_rules: null })).pricingRules).toBeNull();
  });

  it("orderToBreakdown uses pricingRules when present, else discountPercent", () => {
    const legacy = mapPersistedOrder(baseRow({ discount_percent: 10 }));
    const flat = orderToBreakdown(legacy);
    const withRules = orderToBreakdown({ ...legacy, pricingRules: { kg: 0, bag: 0, thresholdKg: null, kgAbove: null } });
    expect(flat.coffee.discountHT).toBeGreaterThan(0);
    expect(withRules.coffee.discountHT).toBe(0);
  });
});
