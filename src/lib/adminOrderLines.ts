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
