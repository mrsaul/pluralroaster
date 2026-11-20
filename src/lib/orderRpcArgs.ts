import type { CartItem } from "@/lib/store";
import { rpcTotalsFromBreakdown, type ClientSnapshot } from "@/lib/clientSnapshot";
import type { TierRules } from "@/lib/tierRules";

/** Item and totals arguments of create_order_with_items, all derived from the snapshot's breakdown. */
export function buildOrderRpcArgs(input: {
  items: CartItem[];
  snapshot: ClientSnapshot;
  tier: { name: string; rules: TierRules } | null;
}) {
  const { items, snapshot, tier } = input;
  const { lineRates } = snapshot.breakdown.coffee;
  if (lineRates.length !== items.length) {
    throw new Error("Order lines and discount rates are out of sync.");
  }
  const totals = rpcTotalsFromBreakdown(snapshot.breakdown);
  const p_items = items.map((item, idx) => ({
    product_id: item.product.id,
    product_name: item.product.name,
    product_sku: item.product.sku ?? null,
    price_per_kg: item.unitPrice != null && item.sizeKg ? item.unitPrice / item.sizeKg : item.product.pricePerKg,
    quantity: item.sizeKg ? item.sizeKg * item.quantity : item.quantity,
    size_label: item.sizeLabel ?? null,
    size_kg: item.sizeKg ?? null,
    line_discount_percent: lineRates[idx],
  }));
  return {
    ...totals,
    p_items,
    ...(tier ? { p_pricing_rules: tier.rules } : {}),
    ...(tier && totals.p_discount_percent != null ? { p_pricing_tier_name: tier.name } : {}),
  };
}
