import type { OrderReceiptData } from "@/lib/orderUtils";
import { round2, type OrderBreakdown, type StoredOrderItem } from "@/lib/pricing";
import type { CartItem } from "@/lib/store";

/** The order summary a client saw, frozen at order time (orders.client_snapshot). */
export type ClientSnapshot = OrderReceiptData & {
  version: 1;
  source: "client" | "admin";
  mismatch?: boolean;
  breakdown: OrderBreakdown;
};

/** An order_items row with the product name and size the diff needs. */
export type ReceiptStoredItem = StoredOrderItem & {
  product_name: string;
  size_label: string | null;
  size_kg: number | null;
};

type SnapshotItem = OrderReceiptData["items"][number];

/** Cart lines as receipt items, same mapping as the checkout receipt. */
export function cartItemsToSnapshotItems(items: CartItem[]): OrderReceiptData["items"] {
  return items.map((item) => ({
    name: item.product.name,
    sizeLabel: item.sizeLabel ?? null,
    sizeKg: item.sizeKg ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? null,
    pricePerKg: item.product.pricePerKg,
    kind: "coffee" as const,
  }));
}

export function buildClientSnapshot(input: {
  items: OrderReceiptData["items"];
  breakdown: OrderBreakdown;
  deliveryDate: string;
  notes: string | null;
  discountPercent: number;
  source: "client" | "admin";
  orderId?: string;
}): ClientSnapshot {
  const { breakdown, discountPercent } = input;
  return {
    version: 1,
    source: input.source,
    orderId: input.orderId ?? "",
    placedAt: new Date().toISOString(),
    deliveryDate: input.deliveryDate,
    notes: input.notes,
    items: input.items,
    totalHT: breakdown.totalHT,
    vatLines: breakdown.vatLines,
    totalTTC: breakdown.totalTTC,
    ...(discountPercent > 0
      ? { discountPercent, discountAmount: breakdown.coffee.discountHT }
      : {}),
    breakdown,
  };
}

export function parseClientSnapshot(raw: unknown): ClientSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !r.breakdown || typeof r.breakdown !== "object") return null;
  if (!Array.isArray(r.items)) return null;
  return raw as ClientSnapshot;
}

export function rpcTotalsFromBreakdown(b: OrderBreakdown): {
  p_total_price: number;
  p_delivery?: { full_price: number; discount_percent: number; net: number };
  p_discount_percent?: number;
} {
  return {
    p_total_price: b.totalHT,
    ...(b.delivery
      ? {
          p_delivery: {
            full_price: b.delivery.fullPriceHT,
            discount_percent: b.delivery.discountPercent,
            net: b.delivery.netHT,
          },
        }
      : {}),
    ...(b.coffee.discountPercent > 0 ? { p_discount_percent: b.coffee.discountPercent } : {}),
  };
}

export type ReceiptLine = {
  key: string;
  label: string;
  sizeLabel: string | null;
  quantity: number;
  unit: "kg" | "bag";
  grossHT: number;
};

const lineKey = (name: string, sizeKg: number | null) => `${name}::${sizeKg ?? "kg"}`;

export function snapshotLines(s: ClientSnapshot): ReceiptLine[] {
  return s.items
    .filter((i: SnapshotItem) => i.kind !== "service")
    .map((i) => {
      const pricePerKg = i.unitPrice != null && i.sizeKg ? i.unitPrice / i.sizeKg : i.pricePerKg;
      const quantityKg = i.sizeKg ? i.sizeKg * i.quantity : i.quantity;
      const isBag = i.sizeKg != null && i.sizeKg < 1;
      return {
        key: lineKey(i.name, i.sizeKg),
        label: i.name,
        sizeLabel: i.sizeLabel,
        quantity: i.quantity,
        unit: isBag ? ("bag" as const) : ("kg" as const),
        grossHT: round2(pricePerKg * quantityKg),
      };
    });
}

export function storedLines(items: ReceiptStoredItem[]): ReceiptLine[] {
  return items
    .filter((i) => i.kind !== "service")
    .map((i) => {
      const qty = Number(i.quantity);
      const isBag = i.size_kg != null && i.size_kg < 1;
      return {
        key: lineKey(i.product_name, i.size_kg),
        label: i.product_name,
        sizeLabel: i.size_label,
        quantity: isBag ? Math.round(qty / (i.size_kg as number)) : qty,
        unit: isBag ? ("bag" as const) : ("kg" as const),
        grossHT: round2(Number(i.price_per_kg) * qty),
      };
    });
}

export type LineChange = {
  key: string;
  status: "same" | "changed" | "added" | "removed";
  before?: ReceiptLine;
  after?: ReceiptLine;
};

export function diffReceipts(
  s: ClientSnapshot,
  currentItems: ReceiptStoredItem[],
  currentBreakdown: OrderBreakdown,
): { identical: boolean; lines: LineChange[]; deliveryChanged: boolean; htDelta: number } {
  const before = snapshotLines(s);
  const after = storedLines(currentItems);
  const afterByKey = new Map(after.map((l) => [l.key, l]));
  const seen = new Set<string>();

  const lines: LineChange[] = before.map((b) => {
    seen.add(b.key);
    const a = afterByKey.get(b.key);
    if (!a) return { key: b.key, status: "removed", before: b };
    const same = a.quantity === b.quantity && a.grossHT === b.grossHT;
    return { key: b.key, status: same ? "same" : "changed", before: b, after: a };
  });
  for (const a of after) {
    if (!seen.has(a.key)) lines.push({ key: a.key, status: "added", after: a });
  }

  const deliveryChanged =
    round2(s.breakdown.delivery?.netHT ?? 0) !== round2(currentBreakdown.delivery?.netHT ?? 0);
  const identical =
    lines.every((l) => l.status === "same") &&
    !deliveryChanged &&
    s.breakdown.totalHT === currentBreakdown.totalHT &&
    s.breakdown.totalTTC === currentBreakdown.totalTTC;

  return {
    identical,
    lines,
    deliveryChanged,
    htDelta: round2(currentBreakdown.totalHT - s.breakdown.totalHT),
  };
}
