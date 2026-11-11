import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { formatFrNumber } from "@/lib/orderUtils";
import { storedOrderBreakdown, type OrderBreakdown } from "@/lib/pricing";
import {
  diffReceipts,
  parseClientSnapshot,
  snapshotLines,
  storedLines,
  type LineChange,
  type ReceiptLine,
  type ReceiptStoredItem,
} from "@/lib/clientSnapshot";
import { cn } from "@/lib/utils";

const signedEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", signDisplay: "always" }).format(n);

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .client-compare-print, .client-compare-print * { visibility: visible !important; }
  .client-compare-print {
    position: absolute !important; left: 0 !important; top: 0 !important;
    transform: none !important; max-height: none !important; overflow: visible !important;
    width: 100% !important; max-width: none !important; box-shadow: none !important; border: 0 !important;
  }
  .client-compare-print .no-print, .client-compare-print > button { display: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

function quantityLabel(l: ReceiptLine): string {
  if (l.unit === "bag") {
    const size = l.sizeLabel ? ` ${l.sizeLabel.replace(/(\d)\s*g$/i, "$1 g")}` : "";
    return `${formatFrNumber(l.quantity)} ×${size}`.trim();
  }
  return `${formatFrNumber(l.quantity)} kg`;
}

function ReceiptColumn({
  title,
  subtitle,
  lines,
  breakdown,
  changes,
}: {
  title: string;
  subtitle?: string;
  lines: ReceiptLine[];
  breakdown: OrderBreakdown;
  changes?: Map<string, LineChange["status"]>;
}) {
  return (
    <section className="space-y-2">
      <header>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {lines.map((l) => {
          const status = changes?.get(l.key) ?? "same";
          return (
            <li
              key={l.key}
              data-change={status}
              className={cn(
                "flex items-baseline justify-between gap-3 px-4 py-2",
                status !== "same" && "bg-amber-50 dark:bg-amber-950/40",
              )}
            >
              <span className={cn(status === "removed" && "line-through text-muted-foreground")}>
                {l.label}
                {status === "added" && (
                  <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-900 no-underline dark:bg-amber-900 dark:text-amber-100">
                    nouveau
                  </span>
                )}
              </span>
              <span className={cn("tabular-nums text-muted-foreground", status === "removed" && "line-through")}>
                {quantityLabel(l)}
              </span>
            </li>
          );
        })}
      </ul>
      <PriceBreakdown breakdown={breakdown} />
    </section>
  );
}

export function ClientReceiptCompare({
  open,
  onOpenChange,
  snapshotRaw,
  items,
  discountPercent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshotRaw: unknown;
  items: ReceiptStoredItem[];
  discountPercent: number;
}) {
  const snapshot = useMemo(() => parseClientSnapshot(snapshotRaw), [snapshotRaw]);
  const currentBreakdown = useMemo(() => storedOrderBreakdown(items, discountPercent), [items, discountPercent]);
  const currentLines = useMemo(() => storedLines(items), [items]);
  const diff = useMemo(
    () => (snapshot ? diffReceipts(snapshot, items, currentBreakdown) : null),
    [snapshot, items, currentBreakdown],
  );

  const mismatch = snapshot?.mismatch === true;
  const showBoth = !!snapshot && !!diff && (!diff.identical || mismatch);
  const statuses = useMemo(
    () => new Map((diff?.lines ?? []).map((l) => [l.key, l.status] as const)),
    [diff],
  );
  const placed = snapshot?.placedAt ? parseISO(snapshot.placedAt) : null;
  const subtitle =
    placed && !Number.isNaN(placed.getTime())
      ? `validée le ${format(placed, "d MMM yyyy HH:mm", { locale: fr })}`
      : undefined;
  const snapshotTitle = snapshot?.source === "admin" ? "Créée par l'admin" : "Vu par le client";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="client-compare-print max-w-4xl max-h-[90vh] overflow-y-auto">
        <style>{PRINT_CSS}</style>
        <DialogHeader>
          <DialogTitle>Récapitulatif client</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {!snapshot && <span>Récapitulatif client non disponible</span>}
              {snapshot && mismatch && (
                <div role="alert" className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  Copie incohérente avec la commande enregistrée
                </div>
              )}
              {snapshot && !mismatch && diff?.identical && (
                <Badge variant="outline" className="border-brand-green-600 text-brand-green-600">Identique à la commande</Badge>
              )}
              {snapshot && !mismatch && diff && !diff.identical && (
                <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Modifiée après validation · {signedEur(diff.htDelta)} HT
                </Badge>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className={cn("grid gap-4", showBoth && "md:grid-cols-2")}>
          {snapshot && (
            <ReceiptColumn
              title={snapshotTitle}
              subtitle={subtitle}
              lines={snapshotLines(snapshot)}
              breakdown={snapshot.breakdown}
              changes={showBoth ? statuses : undefined}
            />
          )}
          {(!snapshot || showBoth) && (
            <ReceiptColumn
              title="Actuelle (à facturer)"
              lines={currentLines}
              breakdown={currentBreakdown}
              changes={showBoth ? statuses : undefined}
            />
          )}
        </div>
        <div className="no-print flex justify-end">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Imprimer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Button + dialog wrapper for the admin order sheet. */
export function ClientReceiptCompareButton(props: Omit<Parameters<typeof ClientReceiptCompare>[0], "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Comparer avec le récapitulatif client
      </Button>
      <ClientReceiptCompare {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
