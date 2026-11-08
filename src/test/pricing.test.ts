import { describe, it, expect } from "vitest";
import {
  round2,
  deliveryFullPrice,
  deliveryBandLabel,
  computeOrderBreakdown,
  cartToCoffeeLines,
} from "@/lib/pricing";
import { buildPlainTextSummary, type OrderReceiptData } from "@/lib/orderUtils";
import type { CartItem, Product } from "@/lib/store";

describe("round2", () => {
  it("rounds decimal half-up", () => {
    expect(round2(27.075)).toBe(27.08);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(41.58)).toBe(41.58);
  });
});

describe("deliveryFullPrice", () => {
  it.each([
    [0, null],
    [1, 20],
    [10, 20],
    [10.25, 24],
    [30, 24],
    [30.25, 30],
    [120, 30],
  ])("%s kg -> %s", (kg, expected) => {
    expect(deliveryFullPrice(kg)).toBe(expected);
  });
});

describe("deliveryBandLabel", () => {
  it("labels the bands", () => {
    expect(deliveryBandLabel(5)).toBe("jusqu'à 10 kg");
    expect(deliveryBandLabel(10)).toBe("jusqu'à 10 kg");
    expect(deliveryBandLabel(10.25)).toBe("11–30 kg");
    expect(deliveryBandLabel(30)).toBe("11–30 kg");
    expect(deliveryBandLabel(31)).toBe("plus de 30 kg");
  });
});

describe("computeOrderBreakdown", () => {
  it("matches the ZAÏA invoice", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 28, quantityKg: 30, vatRate: 5.5 }],
      discountPercent: 10,
      delivery: { kind: "auto", free: false },
    });
    expect(b.coffee).toEqual({ kg: 30, regularHT: 840, discountPercent: 10, discountHT: 84, netHT: 756 });
    expect(b.delivery).toEqual({
      bandLabel: "11–30 kg", fullPriceHT: 24, discountPercent: 50, discountHT: 12, netHT: 12, free: false,
    });
    expect(b.totalHT).toBe(768);
    expect(b.vatLines).toEqual([{ rate: 5.5, amount: 41.58 }, { rate: 20, amount: 2.4 }]);
    expect(b.totalTTC).toBe(811.98);
  });

  it("applies no discount without a tier", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 28, quantityKg: 5, vatRate: 5.5 }],
      discountPercent: 0,
      delivery: { kind: "auto", free: false },
    });
    expect(b.coffee.discountHT).toBe(0);
    expect(b.coffee.netHT).toBe(b.coffee.regularHT);
  });

  it("makes delivery free for free-delivery clients", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 30, quantityKg: 9, vatRate: 5.5 }],
      discountPercent: 0,
      delivery: { kind: "auto", free: true },
    });
    expect(b.delivery).toMatchObject({ fullPriceHT: 20, discountPercent: 100, netHT: 0, free: true });
    expect(b.vatLines.find((v) => v.rate === 20 && v.amount > 0)).toBeUndefined();
  });

  it("mirrors Sellsy per-line rounding", () => {
    const line = { pricePerKg: 28.5, quantityKg: 0.25, vatRate: 5.5 };
    const b = computeOrderBreakdown({
      coffeeLines: [line, line, line],
      discountPercent: 5,
      delivery: { kind: "none" },
    });
    expect(b.coffee.netHT).toBe(20.31);
  });

  it("uses stored delivery rows", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 28, quantityKg: 20, vatRate: 5.5 }],
      discountPercent: 0,
      delivery: { kind: "stored", fullPriceHT: 25, discountPercent: 50 },
    });
    expect(b.delivery).toMatchObject({ bandLabel: "11–30 kg", fullPriceHT: 25, discountHT: 12.5, netHT: 12.5 });
  });

  it("excludes delivery for legacy orders", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 28, quantityKg: 20, vatRate: 5.5 }],
      discountPercent: 0,
      delivery: { kind: "none" },
    });
    expect(b.delivery).toBeNull();
    expect(b.totalHT).toBe(560);
    expect(b.vatLines).toEqual([{ rate: 5.5, amount: 30.8 }]);
  });

  it("has no delivery and zero totals without coffee", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [],
      discountPercent: 10,
      delivery: { kind: "auto", free: false },
    });
    expect(b.delivery).toBeNull();
    expect(b.totalHT).toBe(0);
    expect(b.totalTTC).toBe(0);
  });
});

const product = (over: Partial<Product> = {}) =>
  ({ id: "p1", name: "ZAÏA", pricePerKg: 28, ...over }) as Product;

describe("cartToCoffeeLines", () => {
  it("derives per-kg price and kg from a 250 g bag item", () => {
    const items: CartItem[] = [
      { product: product({ vatRate: 20 }), quantity: 4, sizeLabel: "250g", sizeKg: 0.25, unitPrice: 8 },
    ];
    expect(cartToCoffeeLines(items)).toEqual([{ pricePerKg: 32, quantityKg: 1, vatRate: 20 }]);
  });

  it("uses product price and quantity as kg for a per-kg item, default VAT 5.5", () => {
    const items: CartItem[] = [{ product: product(), quantity: 3 }];
    expect(cartToCoffeeLines(items)).toEqual([{ pricePerKg: 28, quantityKg: 3, vatRate: 5.5 }]);
  });
});

describe("buildPlainTextSummary breakdown", () => {
  it("includes remise, livraison and total TTC", () => {
    const breakdown = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 28, quantityKg: 30, vatRate: 5.5 }],
      discountPercent: 10,
      delivery: { kind: "auto", free: false },
    });
    const data: OrderReceiptData = {
      orderId: "a1b2c3d4-0000", placedAt: "2026-11-08T10:00:00Z", deliveryDate: "2026-11-12", notes: null,
      items: [{ name: "ZAÏA", sizeLabel: null, sizeKg: null, quantity: 30, unitPrice: null, pricePerKg: 28 }],
      totalHT: breakdown.totalHT, vatLines: breakdown.vatLines, totalTTC: breakdown.totalTTC,
      discountPercent: 10, discountAmount: 84, breakdown,
    };
    // Intl.NumberFormat("fr-FR") emits non-breaking spaces; compare with plain ones.
    const text = buildPlainTextSummary(data).replace(/[\u00a0\u202f]/g, " ");
    expect(text).toContain("Remise −10 %");
    expect(text).toContain("Livraison à vélo : 12,00 €");
    expect(text).toContain("Total TTC : 811,98 €");
  });
});
