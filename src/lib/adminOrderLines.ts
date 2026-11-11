import type { OrderReceiptData } from "@/lib/orderUtils";

/** A line in the admin "Nouvelle commande" form: sold by the kg, or as bags of a Sellsy variant. */
export type AdminLine = {
  productId: string;
  /** kg for bulk lines, number of bags for bag lines */
  quantity: number;
  /** €/kg for bulk lines (ignored for bag lines) */
  pricePerKg: number;
  bag?: { sizeLabel: string; sizeKg: number; unitPrice: number; variantId: string | null };
};

export function isBagVariant(v: { size_kg: number | null }): boolean {
  return v.size_kg != null && v.size_kg > 0 && v.size_kg < 1;
}

/** Stored like a client shop order: quantity in kg, price per kg (bag price / bag size). */
export function lineQuantityKg(line: AdminLine): number {
  return line.bag ? line.bag.sizeKg * line.quantity : line.quantity;
}

export function linePricePerKg(line: AdminLine): number {
  return line.bag ? line.bag.unitPrice / line.bag.sizeKg : line.pricePerKg;
}

/** Line total before the tier discount, as shown on the line. */
export function lineGrossHT(line: AdminLine): number {
  return line.bag ? line.bag.unitPrice * line.quantity : line.quantity * line.pricePerKg;
}

/** The product_name stored on the order row; the snapshot uses the same name so the admin diff matches lines. */
export function productRowName(p: { name: string; custom_name: string | null; data_source_mode: string }): string {
  return p.data_source_mode === "custom" && p.custom_name ? p.custom_name : p.name;
}

/** Order lines as receipt items for orders.client_snapshot (name is the stored row's product_name). */
export function adminLinesToSnapshotItems(
  lines: { name: string; line: AdminLine }[],
): OrderReceiptData["items"] {
  return lines.map(({ name, line }) => ({
    name,
    sizeLabel: line.bag?.sizeLabel ?? null,
    sizeKg: line.bag?.sizeKg ?? null,
    quantity: line.quantity,
    unitPrice: line.bag?.unitPrice ?? null,
    pricePerKg: linePricePerKg(line),
    kind: "coffee" as const,
  }));
}
