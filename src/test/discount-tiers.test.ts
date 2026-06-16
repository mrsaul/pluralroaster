import { describe, it, expect } from "vitest";

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
