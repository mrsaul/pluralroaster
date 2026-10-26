import type { KitchenOrder, KitchenOrderItem, KitchenProduct } from "@/kitchen/types";

export const products: KitchenProduct[] = [
  { id: "p1", name: "Pandebono", unitLabel: "Batch", piecesPerUnit: 50, stockUnits: 1, productionMinutes: 90, isVisible: true },
  { id: "p2", name: "Cookies", unitLabel: "Batch", piecesPerUnit: 24, stockUnits: 0, productionMinutes: 60, isVisible: true },
  { id: "p3", name: "Banana bread", unitLabel: "Loaf", piecesPerUnit: 8, stockUnits: 0, productionMinutes: 0, isVisible: true },
];

export function item(productId: string, units: number, adjustedUnits: number | null = null): KitchenOrderItem {
  const p = products.find((x) => x.id === productId)!;
  return { productId, productName: p.name, unitLabel: p.unitLabel, piecesPerUnit: p.piecesPerUnit, units, adjustedUnits, servedFromStockUnits: 0 };
}

let seq = 0;
export function order(over: Partial<KitchenOrder> & { items: KitchenOrderItem[] }): KitchenOrder {
  return {
    id: `o${++seq}`, cafeId: "c", cafeName: "Café", weekStart: "2026-11-02", kind: "weekly", status: "approved",
    urgentReason: null, neededBy: null, readyEta: null, ...over,
  };
}
