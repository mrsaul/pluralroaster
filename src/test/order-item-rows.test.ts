import { describe, it, expect } from "vitest";
import { withOrderItemDefaults } from "@/lib/orderUtils";

describe("withOrderItemDefaults", () => {
  it("gives every row in a batch the same columns, so PostgREST never sends NULL for kind", () => {
    const rows = withOrderItemDefaults([
      { order_id: "o", product_id: "p", quantity: 30, price_per_kg: 26.5 },
      { order_id: "o", product_id: "l", quantity: 1, price_per_kg: 12, kind: "service", list_price: 24, line_discount_percent: 50 },
    ]);
    expect(rows[0]).toMatchObject({ kind: "coffee", list_price: null, line_discount_percent: null });
    expect(rows[1]).toMatchObject({ kind: "service", list_price: 24, line_discount_percent: 50 });
    expect(Object.keys(rows[0]).sort()).toEqual(Object.keys(rows[1]).sort());
  });
});
