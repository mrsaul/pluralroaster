import { describe, it, expect } from "vitest";
import { lineQuantityKg, linePricePerKg, lineGrossHT, isBagVariant, adminLinesToSnapshotItems, productRowName, type AdminLine } from "@/lib/adminOrderLines";
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
