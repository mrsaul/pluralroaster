import { describe, it, expect } from "vitest";
import { adminCoffeeLines, adminOrderItemRows, lineQuantityKg, linePricePerKg, lineGrossHT, isBagVariant, adminLinesToSnapshotItems, productRowName, type AdminLine } from "@/lib/adminOrderLines";
import { computeOrderBreakdown } from "@/lib/pricing";

const bag250: AdminLine = { productId: "bresil", quantity: 1, pricePerKg: 28, bag: { sizeLabel: "250g", sizeKg: 0.25, unitPrice: 9.5, variantId: "v250" } };
const kg: AdminLine = { productId: "cauca", quantity: 10, pricePerKg: 26.5 };

describe("admin order lines", () => {
  it("bag lines: quantity is bags, priced per bag", () => {
    expect(lineQuantityKg({ ...bag250, quantity: 4 })).toBe(1);
    expect(linePricePerKg(bag250)).toBe(38);
    expect(lineGrossHT({ ...bag250, quantity: 4 })).toBe(38);
  });
  it("kg lines unchanged", () => {
    expect(lineQuantityKg(kg)).toBe(10);
    expect(linePricePerKg(kg)).toBe(26.5);
    expect(lineGrossHT(kg)).toBe(265);
  });
  it("only sub-kilo variants are bags", () => {
    expect(isBagVariant({ size_kg: 0.25 })).toBe(true);
    expect(isBagVariant({ size_kg: 0.15 })).toBe(true);
    expect(isBagVariant({ size_kg: 1 })).toBe(false);
    expect(isBagVariant({ size_kg: null })).toBe(false);
  });
  it("order B (tier 15 %): 1 × Brésil 250 g + 10 × Cauca 1 kg matches the expected Sellsy total", () => {
    const lines = [bag250, kg];
    const b = computeOrderBreakdown({
      coffeeLines: lines.map((l) => ({ pricePerKg: linePricePerKg(l), quantityKg: lineQuantityKg(l), vatRate: 5.5 })),
      discountPercent: 15,
      delivery: { kind: "auto", free: false },
    });
    expect(b.totalHT).toBe(245.38);
    expect(b.totalTTC).toBe(260.62);
  });
  it("bag line maps to snapshot item", () => {
    const [item] = adminLinesToSnapshotItems([{ name: "Brésil", line: { ...bag250, quantity: 4 } }]);
    expect(item).toEqual({
      name: "Brésil", sizeLabel: "250g", sizeKg: 0.25, quantity: 4, unitPrice: 9.5, pricePerKg: 38, kind: "coffee",
    });
  });
  it("kg line maps to snapshot item", () => {
    const [item] = adminLinesToSnapshotItems([{ name: "Cauca", line: kg }]);
    expect(item).toEqual({
      name: "Cauca", sizeLabel: null, sizeKg: null, quantity: 10, unitPrice: null, pricePerKg: 26.5, kind: "coffee",
    });
  });
  it("row name prefers the custom name only in custom mode", () => {
    expect(productRowName({ name: "A", custom_name: "B", data_source_mode: "custom" })).toBe("B");
    expect(productRowName({ name: "A", custom_name: "B", data_source_mode: "sellsy" })).toBe("A");
    expect(productRowName({ name: "A", custom_name: null, data_source_mode: "custom" })).toBe("A");
  });
});

describe("admin order pricing rows", () => {
  const rules = { kg: 5, bag: 5, thresholdKg: 20, kgAbove: 10 };
  const rows = [
    { name: "Cauca", vatRate: 5.5, line: { ...kg, quantity: 22 } },
    { name: "Brésil", vatRate: 5.5, line: { ...bag250, quantity: 4 } },
  ];
  it("bag lines are flagged isBag", () => {
    expect(adminCoffeeLines(rows).map((l) => l.isBag)).toEqual([false, true]);
  });
  it("rows carry line_discount_percent per coffee row, kg rate on the kg line", () => {
    const b = computeOrderBreakdown({ coffeeLines: adminCoffeeLines(rows), rules, delivery: { kind: "none" } });
    expect(b.coffee.discountPercent).toBe(10);
    expect(adminOrderItemRows(b.coffee.lineRates, [{ a: 1 }, { a: 2 }])).toEqual([
      { a: 1, line_discount_percent: 10 },
      { a: 2, line_discount_percent: 5 },
    ]);
  });
});
