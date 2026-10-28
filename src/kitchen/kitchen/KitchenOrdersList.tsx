import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKitchenLang } from "@/kitchen/i18n";
import {
  kitchenErrorMessage, useKitchenOrders, useKitchenProducts, useMarkReady, useRoundOccurrences, useSetReadyEta,
} from "../api";
import { useKitchenT } from "../i18n";
import { parisLocalToIso, unitsToPieces } from "../lib/format";
import { effectiveUnits } from "../lib/production";
import { buildPackingListText } from "../lib/share";
import { kitchenDefaultRound, parisDate } from "../lib/rounds";
import { formatWhen, useNow } from "../cafe/useNow";
import RoundPicker from "../components/RoundPicker";
import { useShareText } from "../components/useShareText";
import type { KitchenOrder } from "../types";

function ReadyTime({ order }: { order: KitchenOrder }) {
  const t = useKitchenT();
  const k = t.kitchen;
  const setEta = useSetReadyEta();
  const [value, setValue] = useState("");
  const save = () => {
    const eta = parisLocalToIso(value);
    if (!eta) return;
    setEta.mutate({ orderId: order.id, eta }, {
      onSuccess: () => toast.success(k.readyTimeSaved),
      onError: (err) => toast.error(kitchenErrorMessage(err, t)),
    });
  };
  return (
    <div className="mt-2 flex items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {k.readyTimeLabel}
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        />
      </label>
      <Button variant="outline" className="h-11" disabled={!value || setEta.isPending} onClick={save}>{k.setReadyTime}</Button>
    </div>
  );
}

function OrderCard({ order, onMarkReady }: { order: KitchenOrder; onMarkReady: (o: KitchenOrder) => void }) {
  const k = useKitchenT().kitchen;
  const lang = useKitchenLang();
  const share = useShareText();
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p data-testid="order-cafe" className="font-medium">{order.cafeName}</p>
          <p className="text-xs text-muted-foreground">
            {order.kind === "urgent" ? k.urgent : k.weekly}
            {order.neededBy ? ` · ${k.neededBy(formatWhen(order.neededBy, lang))}` : ""}
          </p>
          {order.readyEta && <p className="text-xs text-muted-foreground">{k.readyAt(formatWhen(order.readyEta, lang))}</p>}
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={k.packingList}
          onClick={() => void share(buildPackingListText(order, lang))}>
          <Share2 className="h-4 w-4" />
        </Button>
      </div>
      <ul className="mt-2 text-sm">
        {order.items.map((it) => {
          const eff = effectiveUnits(it);
          return (
            <li key={it.productId} className="flex justify-between gap-2">
              <span>{it.productName}</span>
              <span className="tabular-nums">{eff} × {it.unitLabel} ({unitsToPieces(eff, it.piecesPerUnit)} {k.pcs})</span>
            </li>
          );
        })}
      </ul>
      {order.status === "approved" && order.kind === "urgent" && <ReadyTime order={order} />}
      {order.status === "approved" ? (
        <Button className="mt-3 h-11 w-full" onClick={() => onMarkReady(order)}>{k.markReady}</Button>
      ) : (
        <p className="mt-3 text-sm font-medium">{k.isReady}</p>
      )}
    </li>
  );
}

export default function KitchenOrdersList() {
  const t = useKitchenT();
  const k = t.kitchen;
  const now = useNow();
  const today = parisDate(now);
  const { data: occurrences = [], isLoading: occLoading, isError: occError } = useRoundOccurrences(
    format(addDays(parseISO(today), -28), "yyyy-MM-dd"),
    format(addDays(parseISO(today), 28), "yyyy-MM-dd"),
  );
  const { data: products = [] } = useKitchenProducts();
  // Selection is stored as a production date so refetches never swap the viewed round.
  const [picked, setPicked] = useState<string | null>(null);
  const defaultRound = useMemo(() => kitchenDefaultRound(occurrences, now), [occurrences, now]);
  const round = occurrences.find((o) => o.productionDate === picked) ?? defaultRound;
  const productionDate = round?.productionDate;
  const { data: orders = [] } = useKitchenOrders({ productionDate });
  const markReady = useMarkReady();
  const [pending, setPending] = useState<KitchenOrder | null>(null);

  const list = useMemo(() => {
    const open = orders.filter((o) => o.status === "approved" || o.status === "ready");
    const urgent = open.filter((o) => o.kind === "urgent").sort((a, b) => (a.neededBy ?? "").localeCompare(b.neededBy ?? ""));
    const weekly = open.filter((o) => o.kind !== "urgent").sort((a, b) => a.cafeName.localeCompare(b.cafeName));
    return [...urgent, ...weekly];
  }, [orders]);

  if (!round || !productionDate) return <p className="p-4 text-sm text-muted-foreground" role={occError ? "alert" : undefined}>{occLoading ? k.loading : occError ? k.roundsLoadError : k.noRound}</p>;

  const stockOf = (id: string) => products.find((p) => p.id === id)?.stockUnits ?? 0;

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <RoundPicker occurrences={occurrences} value={productionDate} onChange={setPicked} defaultValue={defaultRound?.productionDate ?? null} />
      {list.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{k.noOrders}</p>}
      <ul className="flex flex-col gap-2">
        {list.map((o) => <OrderCard key={o.id} order={o} onMarkReady={setPending} />)}
      </ul>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{k.confirmReadyTitle(pending?.cafeName ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>{k.confirmReadyBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="text-sm">
            {pending?.items.map((it) => {
              const eff = effectiveUnits(it);
              const fromStock = Math.min(stockOf(it.productId), eff);
              return (
                <li key={it.productId}>
                  {it.productName} — {k.fromStock(fromStock)} · {k.toProduceLine(eff - fromStock)}
                </li>
              );
            })}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{k.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) {
                  markReady.mutate({ orderId: pending.id }, {
                    onSuccess: () => toast.success(k.markedReady),
                    onError: (err) => toast.error(kitchenErrorMessage(err, t)),
                  });
                }
                setPending(null);
              }}
            >
              {k.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
