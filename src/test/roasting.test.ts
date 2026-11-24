import { describe, it, expect } from "vitest";
import {
  greenKg,
  isBagged,
  isOpenForRoasting,
  parseKgInput,
  parsePercentInput,
  computeRoastingNeeds,
  type RoastingLine,
} from "@/lib/roasting";

const line = (o: Partial<RoastingLine> & { productId: string; productName: string; quantityKg: number }): RoastingLine => ({
  orderId: "o1",
  kind: "coffee",
  deliveryDate: "2026-12-01",
  ...o,
});

describe("roasting", () => {
  it("greenKg adds the percent and rounds to 2 places", () => {
    expect(greenKg(30, 15)).toBe(34.5);
    expect(greenKg(15, 17)).toBe(17.55);
    expect(greenKg(0, 15)).toBe(0);
  });

  it("computeRoastingNeeds nets stock, skips services and covered products", () => {
    const lines: RoastingLine[] = [
      line({ orderId: "a", productId: "gh", productName: "Golden Huila", quantityKg: 30, deliveryDate: "2026-12-01" }),
      line({ orderId: "b", productId: "br", productName: "Brésil", quantityKg: 50, deliveryDate: "2026-12-03" }),
      line({ orderId: "c", productId: "br", productName: "Brésil", quantityKg: 35, deliveryDate: "2026-12-05" }),
      line({ orderId: "c", productId: "br", productName: "Brésil", quantityKg: 1, kind: "service" }),
      line({ orderId: "d", productId: "ca", productName: "Cauca", quantityKg: 5, deliveryDate: "2026-12-04" }),
    ];
    const inputs = { stockKg: { br: 70, ca: 7 }, productPercent: { br: 17 }, defaultPercent: 15 };
    const needs = computeRoastingNeeds(lines, inputs);
    expect(needs).toHaveLength(2);
    expect(needs[0]).toMatchObject({
      productId: "gh", neededKg: 30, stockKg: 0, toRoastKg: 30, percent: 15, percentIsCustom: false, greenKg: 34.5,
    });
    expect(needs[1]).toMatchObject({
      productId: "br", neededKg: 85, stockKg: 70, toRoastKg: 15, percent: 17, percentIsCustom: true, greenKg: 17.55,
      earliestDelivery: "2026-12-03", orderIds: ["b", "c"],
    });

    const all = computeRoastingNeeds(lines, inputs, { includeCovered: true });
    const cauca = all.find((n) => n.productId === "ca");
    expect(cauca).toMatchObject({ toRoastKg: 0, greenKg: 0 });
  });

  it("sums floating kilos exactly", () => {
    const lines = [0.25, 0.15, 0.1].map((q, i) => line({ orderId: `o${i}`, productId: "x", productName: "X", quantityKg: q }));
    const [n] = computeRoastingNeeds(lines, { stockKg: {}, productPercent: {}, defaultPercent: 15 });
    expect(n.neededKg).toBe(0.5);
  });

  it("isBagged / isOpenForRoasting", () => {
    expect(isBagged({ status: "approved", is_packed: true })).toBe(true);
    expect(isBagged({ status: "ready_for_delivery", is_packed: false })).toBe(true);
    expect(isBagged({ status: "delivered", is_packed: false })).toBe(true);
    expect(isBagged({ status: "packaging", is_packed: false })).toBe(false);
    for (const s of ["received", "approved", "packaging"]) {
      expect(isOpenForRoasting({ status: s, is_packed: false })).toBe(true);
    }
    expect(isOpenForRoasting({ status: "packaging", is_packed: true })).toBe(false);
    expect(isOpenForRoasting({ status: "ready_for_delivery", is_packed: false })).toBe(false);
  });

  it("parseKgInput", () => {
    expect(parseKgInput("12,5")).toBe(12.5);
    expect(parseKgInput("0")).toBeNull();
    expect(parseKgInput("-3")).toBeNull();
    expect(parseKgInput("")).toBeNull();
    expect(parseKgInput("abc")).toBeNull();
    expect(parseKgInput(" 30 ")).toBe(30);
  });

  it("parsePercentInput", () => {
    expect(parsePercentInput("17,5")).toBe(17.5);
    expect(parsePercentInput("17")).toBe(17);
    expect(parsePercentInput("0")).toBe(0);
    expect(parsePercentInput("50")).toBe(50);
    expect(parsePercentInput("51")).toBeNull();
    expect(parsePercentInput("-1")).toBeNull();
    expect(parsePercentInput("")).toBeNull();
  });

  it("parseKgInput / parsePercentInput reject anything but plain decimals", () => {
    for (const raw of ["1e3", "0x10", "12.5.3", "Infinity", "1,000.5"]) {
      expect(parseKgInput(raw)).toBeNull();
      expect(parsePercentInput(raw)).toBeNull();
    }
    expect(parseKgInput("12.5")).toBe(12.5);
    expect(parsePercentInput(" 7,25 ")).toBe(7.25);
  });
});
