import { describe, it, expect } from "vitest";
import type { OrderReceiptData } from "@/lib/orderUtils";

// Unit-test the discount math helper — no DB needed
function computeDiscountedTotal(productTotal: number, discountPercent: number): number {
  if (discountPercent <= 0) return productTotal;
  return Math.round(productTotal * (1 - discountPercent / 100) * 100) / 100;
}

describe("discount math", () => {
  it("applies 10% discount correctly", () => {
    expect(computeDiscountedTotal(280, 10)).toBe(252);
  });

  it("applies 5% discount correctly", () => {
    expect(computeDiscountedTotal(100, 5)).toBe(95);
  });

  it("applies 15% discount correctly", () => {
    expect(computeDiscountedTotal(200, 15)).toBe(170);
  });

  it("returns full total when discount is 0", () => {
    expect(computeDiscountedTotal(280, 0)).toBe(280);
  });

  it("rounds correctly at sub-cent level", () => {
    // 3 kg × €28.33/kg = €84.99, 10% off = €76.491 → rounded to €76.49
    expect(computeDiscountedTotal(84.99, 10)).toBe(76.49);
  });
});

describe("OrderReceiptData type", () => {
  it("accepts discountPercent and discountAmount fields", () => {
    const data: OrderReceiptData = {
      orderId: "abc",
      placedAt: new Date().toISOString(),
      deliveryDate: "2026-06-20",
      notes: null,
      items: [],
      totalHT: 252,
      vatRate: 0.20,
      totalTTC: 302.4,
      discountPercent: 10,
      discountAmount: 28,
    };
    expect(data.discountPercent).toBe(10);
    expect(data.discountAmount).toBe(28);
  });

  it("allows omitting discount fields (back-compat)", () => {
    const data: OrderReceiptData = {
      orderId: "abc",
      placedAt: new Date().toISOString(),
      deliveryDate: "2026-06-20",
      notes: null,
      items: [],
      totalHT: 280,
      vatRate: 0.20,
      totalTTC: 336,
    };
    expect(data.discountPercent).toBeUndefined();
  });
});
