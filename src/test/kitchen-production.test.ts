import { describe, expect, it } from "vitest";
import { capacityIfApproved, computeCapacity, computeProduction, effectiveUnits } from "@/kitchen/lib/production";
import { item, order, products } from "./kitchen-fixtures";

const orders = [
  order({ cafeName: "Artivistas", items: [item("p1", 1), item("p2", 1, 0), item("p3", 1)] }),
  order({ cafeName: "New café", items: [item("p1", 2), item("p2", 1)] }),
  order({ cafeName: "Sent", status: "sent", items: [item("p1", 5)] }),
  order({ cafeName: "Ready", status: "ready", items: [item("p1", 4)] }),
];

describe("production", () => {
  it("effectiveUnits prefers adjusted", () => {
    expect(effectiveUnits(item("p1", 3, 0))).toBe(0);
    expect(effectiveUnits(item("p1", 3))).toBe(3);
  });

  it("aggregates approved orders only", () => {
    const rows = computeProduction(orders, products);
    expect(rows.map((r) => r.productId)).toEqual(["p1", "p2", "p3"]);
    expect(rows[0]).toEqual({
      productId: "p1", name: "Pandebono", unitLabel: "Batch", orderedUnits: 3,
      byCafe: [{ cafeName: "Artivistas", units: 1 }, { cafeName: "New café", units: 2 }],
      stockUnits: 1, toProduceUnits: 2,
    });
    expect(rows[1].orderedUnits).toBe(1);
  });

  it("omits products with 0 ordered and floors to produce at 0", () => {
    const rows = computeProduction([order({ items: [item("p1", 3)] })], [{ ...products[0], stockUnits: 10 }, products[1]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].toProduceUnits).toBe(0);
  });

  it("computes capacity", () => {
    const rows = computeProduction(orders, products);
    expect(computeCapacity(rows, products, 180)).toEqual({ neededMinutes: 240, availableMinutes: 180, overByMinutes: 60 });
    expect(computeCapacity(rows, products, 1000).overByMinutes).toBe(0);
  });

  it("capacityIfApproved treats pending as approved", () => {
    const pending = order({ kind: "urgent", status: "sent", items: [item("p1", 1)] });
    expect(capacityIfApproved(orders, pending, products, 180).neededMinutes).toBe(330);
  });
});
