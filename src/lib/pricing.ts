import { DEFAULT_COFFEE_VAT_RATE, type VatLine } from "@/lib/orderUtils";
import type { CartItem, Order } from "@/lib/store";

/** VAT rate (percent) applied to the Loberz bike-delivery service. */
export const DELIVERY_VAT_RATE = 20;

/** Share of the delivery price Plural absorbs (percent). */
export const PLURAL_DELIVERY_CONTRIBUTION_PERCENT = 50;

/**
 * Decimal half-up rounding to 2 places, matching Sellsy.
 * Math.round(n * 100) / 100 gets 27.075 and 1.005 wrong because of binary floats.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return n;
  const s = String(n);
  // Exponent notation (very small/large values) can't take the "e2" shift.
  if (s.includes("e")) return Math.round(n * 100) / 100;
  return Number(Math.round(Number(`${s}e2`)) + "e-2");
}

/** Loberz full price HT by coffee weight; null when there is no coffee. */
export function deliveryFullPrice(coffeeKg: number): number | null {
  if (!(coffeeKg > 0)) return null;
  if (coffeeKg <= 10) return 20;
  if (coffeeKg <= 30) return 24;
  return 30;
}

export function deliveryBandLabel(coffeeKg: number): string {
  if (coffeeKg <= 10) return "jusqu'à 10 kg";
  if (coffeeKg <= 30) return "11–30 kg";
  return "plus de 30 kg";
}

export type PricedCoffeeLine = { pricePerKg: number; quantityKg: number; vatRate: number };

export type DeliveryInput =
  | { kind: "auto"; free: boolean }
  | { kind: "stored"; fullPriceHT: number; discountPercent: number } // from an order_items service row
  | { kind: "none" }; // legacy order

export type DeliveryBreakdown = {
  bandLabel: string;
  fullPriceHT: number;
  discountPercent: number; // 50 or 100
  discountHT: number;
  netHT: number;
  free: boolean;
};

export type OrderBreakdown = {
  coffee: { kg: number; regularHT: number; discountPercent: number; discountHT: number; netHT: number };
  delivery: DeliveryBreakdown | null;
  totalHT: number;
  vatLines: VatLine[];
  totalTTC: number;
};

function buildDelivery(
  input: DeliveryInput,
  coffeeKg: number,
): DeliveryBreakdown | null {
  if (input.kind === "none") return null;

  let fullPriceHT: number;
  let discountPercent: number;
  if (input.kind === "stored") {
    fullPriceHT = input.fullPriceHT;
    discountPercent = input.discountPercent;
  } else {
    const price = deliveryFullPrice(coffeeKg);
    if (price === null) return null;
    fullPriceHT = price;
    discountPercent = input.free ? 100 : PLURAL_DELIVERY_CONTRIBUTION_PERCENT;
  }

  const discountHT = round2((fullPriceHT * discountPercent) / 100);
  return {
    bandLabel: deliveryBandLabel(coffeeKg),
    fullPriceHT,
    discountPercent,
    discountHT,
    netHT: round2(fullPriceHT - discountHT),
    free: discountPercent >= 100,
  };
}

/**
 * Client-facing order breakdown, rounded line by line exactly like the Sellsy invoice.
 * The tier discount applies to coffee only, never to delivery.
 */
export function computeOrderBreakdown(input: {
  coffeeLines: PricedCoffeeLine[];
  discountPercent: number;
  delivery: DeliveryInput;
}): OrderBreakdown {
  const { coffeeLines, discountPercent } = input;

  let kg = 0;
  let regularHT = 0;
  let coffeeNetHT = 0;
  const baseByRate = new Map<number, number>();

  for (const line of coffeeLines) {
    kg += line.quantityKg;
    regularHT += round2(line.pricePerKg * line.quantityKg);
    const unit = round2(line.pricePerKg * (1 - discountPercent / 100));
    const net = round2(unit * line.quantityKg);
    coffeeNetHT += net;
    baseByRate.set(line.vatRate, (baseByRate.get(line.vatRate) ?? 0) + net);
  }
  kg = round2(kg);
  regularHT = round2(regularHT);
  coffeeNetHT = round2(coffeeNetHT);

  const delivery = buildDelivery(input.delivery, kg);
  if (delivery) {
    baseByRate.set(DELIVERY_VAT_RATE, (baseByRate.get(DELIVERY_VAT_RATE) ?? 0) + delivery.netHT);
  }

  const vatLines: VatLine[] = [...baseByRate.entries()]
    .map(([rate, base]) => [rate, round2(base)] as const)
    .filter(([, base]) => base !== 0)
    .sort(([a], [b]) => a - b)
    .map(([rate, base]) => ({ rate, amount: round2((base * rate) / 100) }));

  const totalHT = round2(coffeeNetHT + (delivery?.netHT ?? 0));
  const totalVat = vatLines.reduce((sum, v) => sum + v.amount, 0);

  return {
    coffee: {
      kg,
      regularHT,
      discountPercent,
      discountHT: round2(regularHT - coffeeNetHT),
      netHT: coffeeNetHT,
    },
    delivery,
    totalHT,
    vatLines,
    totalTTC: round2(totalHT + totalVat),
  };
}

/** Cart lines as priced coffee lines (per-kg price, kg and VAT rate) for computeOrderBreakdown. */
export function cartToCoffeeLines(items: CartItem[]): PricedCoffeeLine[] {
  return items.map((item) => ({
    pricePerKg:
      item.unitPrice != null && item.sizeKg ? item.unitPrice / item.sizeKg : item.product.pricePerKg,
    quantityKg: item.sizeKg ? item.sizeKg * item.quantity : item.quantity,
    vatRate: item.product.vatRate ?? DEFAULT_COFFEE_VAT_RATE,
  }));
}

/** Breakdown of a past order from its stored tier discount and delivery row (none for legacy orders). */
export function orderToBreakdown(order: Order): OrderBreakdown {
  return computeOrderBreakdown({
    coffeeLines: order.coffeeLines,
    discountPercent: order.discountPercent,
    delivery: order.delivery ? { kind: "stored", ...order.delivery } : { kind: "none" },
  });
}
