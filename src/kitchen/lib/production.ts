import type { KitchenOrder, KitchenOrderItem, KitchenProduct } from "../types";

export type ProductionRow = {
  productId: string;
  name: string;
  unitLabel: string;
  orderedUnits: number;
  byCafe: { cafeName: string; units: number }[];
  stockUnits: number;
  toProduceUnits: number;
};

export type Capacity = { neededMinutes: number; availableMinutes: number; overByMinutes: number };

/** Units the kitchen will actually deliver: the manager's adjustment wins when set. */
export function effectiveUnits(item: KitchenOrderItem): number {
  return item.adjustedUnits !== null ? item.adjustedUnits : item.units;
}

/** Only approved orders count (ready orders already took their stock). */
export function computeProduction(orders: KitchenOrder[], products: KitchenProduct[]): ProductionRow[] {
  const rows: ProductionRow[] = [];
  for (const product of products) {
    const byCafe: { cafeName: string; units: number }[] = [];
    let orderedUnits = 0;
    for (const order of orders) {
      if (order.status !== "approved") continue;
      let units = 0;
      for (const it of order.items) if (it.productId === product.id) units += effectiveUnits(it);
      if (units <= 0) continue;
      byCafe.push({ cafeName: order.cafeName, units });
      orderedUnits += units;
    }
    if (orderedUnits === 0) continue;
    rows.push({
      productId: product.id,
      name: product.name,
      unitLabel: product.unitLabel,
      orderedUnits,
      byCafe,
      stockUnits: product.stockUnits,
      toProduceUnits: Math.max(0, orderedUnits - product.stockUnits),
    });
  }
  return rows;
}

export function computeCapacity(rows: ProductionRow[], products: KitchenProduct[], availableMinutes: number): Capacity {
  const minutes = new Map(products.map((p) => [p.id, p.productionMinutes]));
  const neededMinutes = rows.reduce((sum, r) => sum + r.toProduceUnits * (minutes.get(r.productId) ?? 0), 0);
  return { neededMinutes, availableMinutes, overByMinutes: Math.max(0, neededMinutes - availableMinutes) };
}

export function capacityIfApproved(
  orders: KitchenOrder[],
  pending: KitchenOrder,
  products: KitchenProduct[],
  availableMinutes: number,
): Capacity {
  const others = orders.filter((o) => o.id !== pending.id);
  const rows = computeProduction([...others, { ...pending, status: "approved" }], products);
  return computeCapacity(rows, products, availableMinutes);
}
