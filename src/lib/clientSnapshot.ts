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
  if (r.version !== 1) return null;
  const b = r.breakdown as Record<string, unknown> | null | undefined;
  if (!b || typeof b !== "object") return null;
  if (typeof b.totalHT !== "number" || typeof b.totalTTC !== "number") return null;
  if (!Array.isArray(r.items) || r.items.some((i) => !i || typeof i !== "object")) return null;
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

/** Merges lines sharing a key (quantity and gross HT summed), keeping first-seen order. */
function mergeLines(lines: ReceiptLine[]): ReceiptLine[] {
  const out = new Map<string, ReceiptLine>();
  for (const l of lines) {
    const prev = out.get(l.key);
    out.set(
      l.key,
      prev ? { ...prev, quantity: round2(prev.quantity + l.quantity), grossHT: round2(prev.grossHT + l.grossHT) } : l,
    );
  }
  return [...out.values()];
}

export function snapshotLines(s: ClientSnapshot): ReceiptLine[] {
  return mergeLines(s.items
    .filter((i: SnapshotItem) => i.kind !== "service")
    .map((i) => {
      const pricePerKg = i.unitPrice != null && i.sizeKg ? i.unitPrice / i.sizeKg : i.pricePerKg;
      const quantityKg = i.sizeKg ? i.sizeKg * i.quantity : i.quantity;
      const isBag = i.sizeKg != null && i.sizeKg > 0;
      return {
        key: lineKey(i.name, i.sizeKg),
        label: i.name,
        sizeLabel: i.sizeLabel,
        quantity: i.quantity,
        unit: isBag ? ("bag" as const) : ("kg" as const),
        grossHT: round2(pricePerKg * quantityKg),
      };
    }));
}

export function storedLines(items: ReceiptStoredItem[]): ReceiptLine[] {
  return mergeLines(items
    .filter((i) => i.kind !== "service")
    .map((i) => {
      const qty = Number(i.quantity);
      const isBag = i.size_kg != null && i.size_kg > 0;
      return {
        key: lineKey(i.product_name, i.size_kg),
        label: i.product_name,
        sizeLabel: i.size_label,
        quantity: isBag ? Math.round(qty / (i.size_kg as number)) : qty,
        unit: isBag ? ("bag" as const) : ("kg" as const),
        grossHT: round2(Number(i.price_per_kg) * qty),
      };
    }));
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
    const same = round2(a.quantity) === round2(b.quantity) && a.grossHT === b.grossHT;
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
    round2(s.breakdown.totalHT) === round2(currentBreakdown.totalHT) &&
    round2(s.breakdown.totalTTC) === round2(currentBreakdown.totalTTC);

  return {
    identical,
    lines,
    deliveryChanged,
    htDelta: round2(currentBreakdown.totalHT - s.breakdown.totalHT),
  };
}
