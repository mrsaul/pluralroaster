// Pure order VAT math shared by edge functions (no Deno APIs, no imports).
// Mirrors src/lib/pricing.ts computeOrderBreakdown rounding exactly.

export const DEFAULT_COFFEE_VAT_RATE = 5.5;
export const DELIVERY_VAT_RATE = 20;

/**
 * Decimal half-up rounding to 2 places, matching Sellsy and src/lib/pricing.ts.
 * toPrecision(12) first drops float-product noise (18.79 × 7.5 = 140.92499999999998 → 140.925).
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return n;
  const s = String(Number(n.toPrecision(12)));
  if (s.includes("e")) return Math.round(n * 100) / 100;
  return Number(Math.round(Number(`${s}e2`)) + "e-2");
}

/**
 * Tier-discounted coffee unit price per kg: one definition for invoice, export and email.
 * No tier: the raw price, unrounded, as sellsy-sync sends it.
 */
export function discountedUnit(pricePerKg: number, discountPercent: number): number {
  const price = Number(pricePerKg);
  return discountPercent > 0 ? round2(price * (1 - discountPercent / 100)) : price;
}

export type VatItem = {
  /** order_items.kind; 'service' = Loberz delivery row (price_per_kg is already net). */
  kind?: string | null;
  quantity: number;
  price_per_kg: number;
  /** Coffee VAT rate (product's sellsy_tax_rate); defaults to 5.5. */
  vat_rate?: number | null;
};

export type VatLine = { rate: number; amount: number };

export function isServiceItem(item: { kind?: string | null }): boolean {
  return item.kind === "service";
}

/** VAT rate of a line: services 20, coffee its product rate (fallback 5.5). */
export function lineVatRate(item: VatItem): number {
  if (isServiceItem(item)) return DELIVERY_VAT_RATE;
  return item.vat_rate != null ? Number(item.vat_rate) : DEFAULT_COFFEE_VAT_RATE;
}

/** Discounted unit price of a coffee line (service rows are never discounted). */
export function lineUnitNet(item: VatItem, discountPercent: number): number {
  const price = Number(item.price_per_kg);
  return isServiceItem(item) ? price : discountedUnit(price, discountPercent);
}

/** Net line total HT, rounded like the Sellsy invoice. */
export function lineNetHT(item: VatItem, discountPercent: number): number {
  return round2(lineUnitNet(item, discountPercent) * Number(item.quantity));
}

/** Order totals: HT, one VAT line per rate (rate ascending, zero bases dropped), TTC. */
export function computeOrderVat(
  items: VatItem[],
  discountPercent: number,
): { totalHT: number; vatLines: VatLine[]; totalVAT: number; totalTTC: number } {
  const baseByRate = new Map<number, number>();
  let total = 0;
  for (const item of items) {
    const net = lineNetHT(item, discountPercent);
    total += net;
    const rate = lineVatRate(item);
    baseByRate.set(rate, (baseByRate.get(rate) ?? 0) + net);
  }
  const vatLines: VatLine[] = [...baseByRate.entries()]
    .map(([rate, base]) => [rate, round2(base)] as const)
    .filter(([, base]) => base !== 0)
    .sort(([a], [b]) => a - b)
    .map(([rate, base]) => ({ rate, amount: round2((base * rate) / 100) }));
  const totalHT = round2(total);
  const totalVAT = vatLines.reduce((s, v) => s + v.amount, 0);
  return { totalHT, vatLines, totalVAT, totalTTC: round2(totalHT + totalVAT) };
}
