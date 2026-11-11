import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
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
              <span>{l.label}</span>
              <span className="tabular-nums text-muted-foreground">{quantityLabel(l)}</span>
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
  createdAt: _createdAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshotRaw: unknown;
  items: ReceiptStoredItem[];
  discountPercent: number;
  createdAt: string;
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Récapitulatif client</DialogTitle>
          <DialogDescription>
            {!snapshot && "Récapitulatif client non disponible"}
            {snapshot && mismatch && "Copie incohérente avec la commande enregistrée"}
            {snapshot && !mismatch && diff?.identical && "Identique à la commande"}
            {snapshot && !mismatch && diff && !diff.identical && (
              <>Modifiée après validation ({signedEur(diff.htDelta)} HT)</>
            )}
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
        <div className="flex justify-end print:hidden">
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
