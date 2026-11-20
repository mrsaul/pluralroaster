import type { Order, Product } from "@/lib/store";
import { DEFAULT_COFFEE_VAT_RATE } from "@/lib/orderUtils";
import { isBagSize, parseTierRules } from "@/lib/tierRules";
import { round2 } from "@/lib/pricing";

export type PersistedOrderRow = {
  id: string;
  delivery_date: string;
  total_kg: number;
  total_price: number;
  status: Order["status"];
  sellsy_id: string | null;
  created_at: string;
  notes: string | null;
  reordered_from: string | null;
  delivery_address_id: string | null;
  discount_percent?: number | null;
  pricing_rules?: unknown;
  order_items: {
    kind?: string | null;
    list_price?: number | null;
    line_discount_percent?: number | null;
    quantity: number;
    price_per_kg: number;
    size_label?: string | null;
    size_kg?: number | null;
    product_name: string;
    product_sku: string | null;
    product_id: string;
    products: {
      id: string;
      name: string;
      origin: string | null;
      sku: string | null;
      price_per_kg: number;
      roast_level: string | null;
      is_active: boolean;
      sellsy_tax_rate: number | null;
    } | null;
  }[];
};

const normalizeRoastLevel = (roastLevel: string | null): Product["roastLevel"] => {
  if (roastLevel === "light" || roastLevel === "medium" || roastLevel === "dark" || roastLevel === "espresso") {
    return roastLevel;
  }

  return "medium";
};

/** Stored size_kg when the row is a bag (under 1 kg), else null. */
const bagSizeKg = (item: PersistedOrderRow["order_items"][number]): number | null => {
  const size = item.size_kg == null ? null : Number(item.size_kg);
  return size && isBagSize(size) ? size : null;
};

export const mapPersistedOrder = (order: PersistedOrderRow): Order => {
  const rows = order.order_items ?? [];
  // The delivery service row is never a product: it must not appear in items (and so never on reorder).
  const serviceRow = rows.find((r) => r.kind === "service");
  const coffeeRows = rows.filter((r) => r.kind !== "service");

  return {
    id: order.id,
    deliveryDate: order.delivery_date,
    totalKg: Number(order.total_kg),
    totalPrice: Number(order.total_price),
    status: order.status,
    sellsyId: order.sellsy_id ?? undefined,
    createdAt: order.created_at,
    notes: order.notes ?? null,
    reorderedFrom: order.reordered_from ?? null,
    deliveryAddressId: order.delivery_address_id ?? null,
    discountPercent: Number(order.discount_percent ?? 0),
    pricingRules: parseTierRules(order.pricing_rules),
    // Rows saved before list_price existed: price_per_kg is the amount charged, shown as a plain charge.
    coffeeLines: coffeeRows.map((item) => ({
      pricePerKg: Number(item.price_per_kg),
      quantityKg: Number(item.quantity),
      vatRate: item.products?.sellsy_tax_rate ?? DEFAULT_COFFEE_VAT_RATE,
      ...(bagSizeKg(item) ? { isBag: true } : {}),
    })),
    delivery: serviceRow
      ? {
          fullPriceHT: Number(serviceRow.list_price ?? serviceRow.price_per_kg),
          discountPercent: Number(serviceRow.line_discount_percent ?? 0),
        }
      : null,
    items: coffeeRows.map((item) => {
      const sizeKg = bagSizeKg(item);
      return {
      // Bags are stored as kg (bags x size_kg): turn them back into a bag count.
      quantity: sizeKg ? Math.round(Number(item.quantity) / sizeKg) : Number(item.quantity),
      ...(sizeKg
        ? {
            sizeLabel: item.size_label ?? undefined,
            sizeKg,
            unitPrice: round2(Number(item.price_per_kg) * sizeKg),
          }
        : {}),
      product: {
        id: item.products?.id ?? item.product_id,
        name: item.products?.name ?? item.product_name,
        origin: item.products?.origin ?? null,
        sku: item.products?.sku ?? item.product_sku ?? item.product_id,
        pricePerKg: Number(item.products?.price_per_kg ?? item.price_per_kg),
        roastLevel: normalizeRoastLevel(item.products?.roast_level ?? null),
        available: item.products?.is_active ?? true,
        vatRate: item.products?.sellsy_tax_rate ?? undefined,
      },
      };
    }),
  };
};
