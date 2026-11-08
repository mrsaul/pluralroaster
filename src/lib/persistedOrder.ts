import type { Order, Product } from "@/lib/store";

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
  order_items: {
    kind?: string | null;
    list_price?: number | null;
    line_discount_percent?: number | null;
    quantity: number;
    price_per_kg: number;
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
    // Rows saved before list_price existed: price_per_kg is the amount charged, shown as a plain charge.
    delivery: serviceRow
      ? {
          fullPriceHT: Number(serviceRow.list_price ?? serviceRow.price_per_kg),
          discountPercent: Number(serviceRow.line_discount_percent ?? 0),
        }
      : null,
    items: coffeeRows.map((item) => ({
      quantity: Number(item.quantity),
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
    })),
  };
};
