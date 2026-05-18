// src/lib/orderUtils.ts
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderReceiptData = {
  orderId: string;       // full UUID — display as slice(0,8).toUpperCase()
  placedAt: string;      // ISO timestamp
  deliveryDate: string;  // YYYY-MM-DD
  notes: string | null;
  items: {
    name: string;
    sizeLabel: string | null;
    sizeKg: number | null;
    quantity: number;
    unitPrice: number | null;  // per-bag price when variant pricing applies
    pricePerKg: number;
  }[];
  totalHT: number;
  vatRate: 0.20;
  totalTTC: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRIND_LABEL: Record<string, string> = {
  espresso: "Espresso",
  filter: "Filtre",
  french_press: "Piston",
};

/** Infer grind from product name — returns the grind key + whether it's inferred. */
export function inferGrind(
  productName: string,
  grindType: string | null,
): { key: string | null; inferred: boolean } {
  if (grindType) return { key: grindType, inferred: false };
  const lower = productName.toLowerCase();
  if (lower.includes("piston") || lower.includes("french press"))
    return { key: "french_press", inferred: true };
  if (lower.includes("filtre") || lower.includes("filter"))
    return { key: "filter", inferred: true };
  if (lower.includes("espresso")) return { key: "espresso", inferred: true };
  return { key: null, inferred: false };
}

/** Format a YYYY-MM-DD date string in French long form. */
export function formatDeliveryDate(dateStr: string): string {
  return format(parseISO(dateStr), "EEEE d MMMM yyyy", { locale: fr });
  // → "vendredi 22 mai 2026"
}

/** Compute the HT line total for one item. */
function itemLineHT(item: OrderReceiptData["items"][number]): number {
  if (item.unitPrice != null) return item.unitPrice * item.quantity;
  const qty = item.sizeKg != null ? item.sizeKg * item.quantity : item.quantity;
  return qty * item.pricePerKg;
}

/** Format a number as French locale currency: "183,60 €" */
function fmtEur(n: number): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
}

/**
 * Build the compact plain-text summary (WhatsApp-first).
 *
 * Example output:
 *   Commande Plural Café — #A1B2C3D4
 *   Livraison souhaitée : vendredi 22 mai 2026
 *   Notes : Livraison avant 9h svp   ← only when notes present
 *
 *   - Colombie Golden Huila — 250g Espresso × 4 — 24,00 €
 *   ...
 *
 *   Total TTC : 183,60 €
 *
 *   pluralcafe.fr
 */
export function buildPlainTextSummary(data: OrderReceiptData): string {
  const ref = data.orderId.slice(0, 8).toUpperCase();
  const lines: string[] = [];

  lines.push(`Commande Plural Café — #${ref}`);
  lines.push(`Livraison souhaitée : ${formatDeliveryDate(data.deliveryDate)}`);
  if (data.notes) {
    lines.push(`Notes : ${data.notes}`);
  }
  lines.push("");

  for (const item of data.items) {
    // grindType is not stored in OrderReceiptData; always infer from product name
    const grind = inferGrind(item.name, null);
    const grindLabel = grind.key ? (GRIND_LABEL[grind.key] ?? grind.key) : null;
    const sizePart = item.sizeLabel
      ? item.sizeLabel
      : item.sizeKg != null
        ? `${item.sizeKg < 1 ? item.sizeKg * 1000 + "g" : item.sizeKg + " kg"}`
        : "";
    const lineTotal = fmtEur(itemLineHT(item));
    const parts = [sizePart || null, grindLabel].filter(Boolean);
    const sizeFull = parts.join(" ");
    lines.push(`- ${item.name} — ${sizeFull} × ${item.quantity} — ${lineTotal}`);
  }

  lines.push("");
  lines.push(`Total TTC : ${fmtEur(data.totalTTC)}`);
  lines.push("");
  lines.push("pluralcafe.fr");

  return lines.join("\n");
}
