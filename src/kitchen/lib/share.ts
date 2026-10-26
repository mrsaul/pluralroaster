import { format, parseISO } from "date-fns";
import type { Lang } from "@/i18n";
import type { KitchenOrder } from "../types";
import { effectiveUnits, type ProductionRow } from "./production";
import { unitsToPieces } from "./format";

const ddMM = (iso: string) => format(parseISO(iso), "dd/MM");

function orderHeader(order: KitchenOrder, lang: Lang): string {
  const kind =
    order.kind === "urgent"
      ? lang === "fr" ? "Commande urgente" : "Urgent order"
      : lang === "fr" ? `Commande de la semaine du ${ddMM(order.weekStart)}` : `Order for week of ${ddMM(order.weekStart)}`;
  return `${order.cafeName}\n${kind}`;
}

export function buildOrderShareText(order: KitchenOrder, lang: Lang): string {
  const lines = order.items.map((it) => {
    const eff = effectiveUnits(it);
    const qty = it.adjustedUnits !== null && it.adjustedUnits !== it.units ? `${it.units} → ${eff}` : `${eff}`;
    return `${it.productName} — ${qty} × ${it.unitLabel} (${unitsToPieces(eff, it.piecesPerUnit)} pcs)`;
  });
  return [orderHeader(order, lang), "", ...lines].join("\n");
}

export function buildChangesShareText(
  cafeName: string,
  changes: { productName: string; from: number; to: number }[],
  lang: Lang,
): string {
  const header = lang === "fr" ? `${cafeName} — modifications de commande` : `${cafeName} — order changes`;
  return [header, "", ...changes.map((c) => `${c.productName} : ${c.from} → ${c.to}`)].join("\n");
}

export function buildProductionShareText(weekStart: string, rows: ProductionRow[], lang: Lang): string {
  const header = lang === "fr" ? `Production de la semaine du ${ddMM(weekStart)}` : `Production for week of ${ddMM(weekStart)}`;
  const lines = rows.map((r) =>
    lang === "fr"
      ? `${r.name} — à produire : ${r.toProduceUnits} × ${r.unitLabel} (commandé ${r.orderedUnits}, stock ${r.stockUnits})`
      : `${r.name} — to produce: ${r.toProduceUnits} × ${r.unitLabel} (ordered ${r.orderedUnits}, stock ${r.stockUnits})`,
  );
  return [header, "", ...lines].join("\n");
}

export function buildPackingListText(order: KitchenOrder, lang: Lang): string {
  const header = lang === "fr" ? `Préparation — ${order.cafeName}` : `Packing list — ${order.cafeName}`;
  const week = lang === "fr" ? `Semaine du ${ddMM(order.weekStart)}` : `Week of ${ddMM(order.weekStart)}`;
  const lines = order.items.map((it) => {
    const eff = effectiveUnits(it);
    return `${it.productName} — ${eff} × ${it.unitLabel} (${unitsToPieces(eff, it.piecesPerUnit)} pcs)`;
  });
  return [header, week, "", ...lines].join("\n");
}
