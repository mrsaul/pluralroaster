import { describe, it, expect } from "vitest";
import {
  round2,
  lineNetHT,
  computeOrderVat,
  discountedUnit,
} from "../../supabase/functions/_shared/order-vat";
import { computeOrderBreakdown, storedOrderBreakdown } from "@/lib/pricing";

describe("order-vat shared module", () => {
  it("round2 is decimal half-up", () => {
    expect(round2(27.075)).toBe(27.08);
    expect(round2(1.005)).toBe(1.01);
  });

  it("ZAÏA order: 30 kg at 28 €/kg, 10 % tier, delivery net 12", () => {
    const items = [
      { kind: "coffee", quantity: 30, price_per_kg: 28, vat_rate: 5.5 },
      { kind: "service", quantity: 1, price_per_kg: 12 },
    ];
    const r = computeOrderVat(items, 10);
    expect(r.totalHT).toBe(768);
    expect(r.vatLines).toEqual([
      { rate: 5.5, amount: 41.58 },
      { rate: 20, amount: 2.4 },
    ]);
    expect(r.totalTTC).toBe(811.98);
  });

  it("delivery is never tier-discounted; coffee is", () => {
    expect(lineNetHT({ kind: "service", quantity: 1, price_per_kg: 12 }, 10)).toBe(12);
    expect(lineNetHT({ kind: "coffee", quantity: 30, price_per_kg: 28 }, 10)).toBe(756);
  });

  it("free delivery yields no 20 % line; legacy order has no service row", () => {
    const free = computeOrderVat(
      [{ quantity: 2, price_per_kg: 30 }, { kind: "service", quantity: 1, price_per_kg: 0 }],
      0,
    );
    expect(free.vatLines.map((v) => v.rate)).toEqual([5.5]);
    const legacy = computeOrderVat([{ quantity: 2, price_per_kg: 30 }], 0);
    expect(legacy.totalHT).toBe(60);
    expect(legacy.totalTTC).toBe(63.3);
  });

  it("250 g bag rounding matches pricing.ts", () => {
    // 9 bags of 250 g = 2.25 kg at 27.07 €/kg, 5 % tier
    const items = [
      { kind: "coffee", quantity: 2.25, price_per_kg: 27.07, vat_rate: 5.5 },
      { kind: "service", quantity: 1, price_per_kg: 10, list_price: 20, line_discount_percent: 50 },
    ];
    const mine = computeOrderVat(items, 5);
    const app = storedOrderBreakdown(items, 5);
    expect(mine.totalHT).toBe(app.totalHT);
    expect(mine.vatLines).toEqual(app.vatLines);
    expect(mine.totalTTC).toBe(app.totalTTC);
  });

  it("discounted unit uses decimal half-up and equals pricing.ts", () => {
    expect(discountedUnit(21.5, 15)).toBe(18.28);
    expect(discountedUnit(10.45, 10)).toBe(9.41);
    for (const [price, d] of [[21.5, 15], [10.45, 10]] as const) {
      const app = computeOrderBreakdown({
        coffeeLines: [{ pricePerKg: price, quantityKg: 1, vatRate: 5.5 }],
        discountPercent: d,
        delivery: { kind: "none" },
      });
      expect(app.coffee.netHT).toBe(discountedUnit(price, d));
    }
  });
});
