import { round2 } from "@/lib/pricing";

/** Extra green weight (percent) added to roasted kilos to cover roasting loss. */
export const DEFAULT_GREEN_PERCENT = 15;
const MAX_GREEN_PERCENT = 50;

type PackState = { status: string; is_packed: boolean };

/** Already bagged: packed, or past packaging. */
export function isBagged(o: PackState): boolean {
  return o.is_packed || o.status === "ready_for_delivery" || o.status === "delivered";
}

/** Still needs coffee roasted: received/approved/packaging and not yet packed. */
export function isOpenForRoasting(o: PackState): boolean {
  return !o.is_packed && (o.status === "received" || o.status === "approved" || o.status === "packaging");
}

/** Green kilos to weigh for a roasted quantity. */
export function greenKg(roastedKg: number, percent: number): number {
  return round2(roastedKg * (1 + percent / 100));
}

function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "12,5" -> 12.5; empty, invalid or <= 0 -> null. */
export function parseKgInput(raw: string): number | null {
  const n = parseNumber(raw);
  return n !== null && n > 0 ? n : null;
}

/** Percent between 0 and 50 inclusive; otherwise null. */
export function parsePercentInput(raw: string): number | null {
  const n = parseNumber(raw);
  return n !== null && n >= 0 && n <= MAX_GREEN_PERCENT ? n : null;
}

export type RoastingLine = {
  orderId: string;
  productId: string;
  productName: string;
  quantityKg: number;
  kind: "coffee" | "service";
  deliveryDate: string;
};

export type RoastingInputs = {
  stockKg: Record<string, number>;
  productPercent: Record<string, number | null>;
  defaultPercent: number;
};

export type RoastingNeed = {
  productId: string;
  productName: string;
  neededKg: number;
  stockKg: number;
  toRoastKg: number;
  percent: number;
  percentIsCustom: boolean;
  greenKg: number;
  earliestDelivery: string;
  orderIds: string[];
};

export function computeRoastingNeeds(
  lines: RoastingLine[],
  inputs: RoastingInputs,
  opts: { includeCovered?: boolean } = {},
): RoastingNeed[] {
  const byProduct = new Map<string, { name: string; kg: number; earliest: string; orderIds: string[] }>();
  for (const l of lines) {
    if (l.kind === "service") continue;
    const cur = byProduct.get(l.productId);
    if (!cur) {
      byProduct.set(l.productId, { name: l.productName, kg: l.quantityKg, earliest: l.deliveryDate, orderIds: [l.orderId] });
      continue;
    }
    cur.kg += l.quantityKg;
    if (l.deliveryDate < cur.earliest) cur.earliest = l.deliveryDate;
    if (!cur.orderIds.includes(l.orderId)) cur.orderIds.push(l.orderId);
  }

  const needs: RoastingNeed[] = [];
  for (const [productId, p] of byProduct) {
    const neededKg = round2(p.kg);
    const stockKg = inputs.stockKg[productId] ?? 0;
    const toRoastKg = round2(Math.max(0, neededKg - stockKg));
    if (toRoastKg <= 0 && !opts.includeCovered) continue;
    const custom = inputs.productPercent[productId];
    const percentIsCustom = custom != null;
    const percent = percentIsCustom ? custom : inputs.defaultPercent;
    needs.push({
      productId,
      productName: p.name,
      neededKg,
      stockKg,
      toRoastKg,
      percent,
      percentIsCustom,
      greenKg: greenKg(toRoastKg, percent),
      earliestDelivery: p.earliest,
      orderIds: p.orderIds,
    });
  }
  return needs.sort(
    (a, b) => a.earliestDelivery.localeCompare(b.earliestDelivery) || a.productName.localeCompare(b.productName, "fr"),
  );
}

/** 17 -> "17", 17.5 -> "17,5", 17.256 -> "17,26". */
export function formatPercent(p: number): string {
  return String(Math.round(p * 100) / 100).replace(".", ",");
}
