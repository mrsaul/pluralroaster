import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { QuantityStepper } from "@/components/QuantityStepper";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKitchenLang } from "@/kitchen/i18n";
import {
  kitchenErrorMessage, useGetOrCreateDraft, useKitchenOrders,
  useKitchenProducts, useNextOpenRounds, useSendOrder, useSetItem,
} from "../api";
import { useKitchenT } from "../i18n";
import { formatCountdown, unitsToPieces } from "../lib/format";
import { formatRoundLabel } from "../lib/rounds";
import type { RoundOccurrence } from "../types";
import CafeCartBar from "./CafeCartBar";
import UrgentOrderSheet from "./UrgentOrderSheet";
import { BrandShape } from "../ui/BrandShape";
import { StatusPill } from "../ui/StatusPill";
import { formatWhen, useNow } from "./useNow";

const DEBOUNCE_MS = 400;

/** "Production du mardi 3 nov." -> "Mardi 3 nov." (toggle label). */
function shortRoundLabel(occ: RoundOccurrence, lang: "fr" | "en"): string {
  const s = formatRoundLabel(occ, lang).replace(/^Production (du )?/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CafeHome({ cafeId, cafeName }: { cafeId: string; cafeName: string | null }) {
  const c = useKitchenT().cafeApp;
  const lang = useKitchenLang();
  const now = useNow();
  const { data: rounds = [], isLoading } = useNextOpenRounds(2);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const qc = useQueryClient();
  const [urgentOpen, setUrgentOpen] = useState(false);
  const { data: products = [] } = useKitchenProducts();
  const visible = useMemo(() => products.filter((p) => p.isVisible), [products]);

  // Selection is by production date so a refetch that shifts the list never swaps the cart.
  const round = rounds.find((r) => r.productionDate === pickedDate) ?? rounds[0];
  const closed = !!round && now >= new Date(round.cutoffAt);
  // The shown round just closed: refetch so it drops out of the open rounds.
  useEffect(() => {
    if (closed) void qc.invalidateQueries({ queryKey: ["kitchen", "nextOpenRounds"] });
  }, [closed, qc]);

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">{c.loading}</p>;

  return (
    <div className="mx-auto max-w-xl px-4 pb-20 pt-2">
      {cafeName && <p className="mb-3 text-sm text-muted-foreground">{cafeName}</p>}

      <Button variant="outline" className="mb-4 w-full" onClick={() => setUrgentOpen(true)}>{c.urgentButton}</Button>

      {!round ? (
        <p className="text-sm text-muted-foreground">{c.noRound}</p>
      ) : (
        <>
          <div className="mb-4">
            <p className="font-medium">{formatRoundLabel(round, lang)}</p>
            <p className="text-sm text-muted-foreground">
              {c.cutoffIn(formatCountdown(new Date(round.cutoffAt), now, lang))}
            </p>
            {rounds.length > 1 && (
              <div role="group" className="mt-3 grid grid-cols-2 gap-2">
                {rounds.map((r) => (
                  <Button
                    key={r.productionDate}
                    variant={r === round ? "default" : "outline"}
                    aria-pressed={r === round}
                    onClick={() => setPickedDate(r.productionDate)}
                  >
                    {shortRoundLabel(r, lang)}
                  </Button>
                ))}
              </div>
            )}
          </div>
          {/* Keyed by round so each round has its own cart state; unmount flushes pending edits. */}
          <RoundCart key={round.productionDate} cafeId={cafeId} round={round} />
        </>
      )}

      <UrgentOrderSheet open={urgentOpen} onOpenChange={setUrgentOpen} cafeId={cafeId} products={visible} />
    </div>
  );
}

function RoundCart({ cafeId, round }: { cafeId: string; round: RoundOccurrence }) {
  const t = useKitchenT();
  const c = t.cafeApp;
  const lang = useKitchenLang();
  const qc = useQueryClient();
  const now = useNow();
  const productionDate = round.productionDate;

  const { data: products = [] } = useKitchenProducts();
  const { data: orders = [] } = useKitchenOrders({ cafeId, productionDate, kind: "weekly" });
  const draft = useGetOrCreateDraft();
  const setItem = useSetItem();
  const send = useSendOrder();

  const order = orders[0];
  const visible = useMemo(() => products.filter((p) => p.isVisible), [products]);
  // Lines of products hidden since they were ordered: shown so the café can remove them.
  const hiddenLines = useMemo(() => {
    const ids = new Set(visible.map((p) => p.id));
    return (order?.items ?? []).filter((i) => !ids.has(i.productId) && i.units > 0);
  }, [order, visible]);
  const cutoff = new Date(round.cutoffAt);
  const beforeCutoff = now < cutoff;
  const editableStatus = !order || order.status === "draft" || order.status === "sent" || order.status === "approved";
  const canEdit = beforeCutoff && editableStatus;

  const [qty, setQty] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const orderIdRef = useRef<string | undefined>(order?.id);
  orderIdRef.current = order?.id;
  const orderRef = useRef(order);
  orderRef.current = order;
  const pending = useRef<Record<string, number>>({});
  const draftPromise = useRef<Promise<string> | null>(null);
  const flushRef = useRef<(id: string, v: number) => Promise<void>>(async () => {});
  const [confirmed, setConfirmed] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{ id: string; v: number } | null>(null);

  // Sync server quantities into the local map, except for products being edited.
  useEffect(() => {
    if (!order) return;
    setQty((prev) => {
      const next = { ...prev };
      for (const id of [...visible.map((p) => p.id), ...hiddenLines.map((i) => i.productId)]) {
        if (timers.current[id]) continue;
        next[id] = order.items.find((i) => i.productId === id)?.units ?? 0;
      }
      return next;
    });
  }, [order, visible, hiddenLines]);

  // On unmount, flush every pending edit instead of dropping it.
  useEffect(() => () => {
    for (const [id, v] of Object.entries(pending.current)) {
      clearTimeout(timers.current[id]);
      void flushRef.current(id, v);
    }
    timers.current = {};
  }, []);
  useEffect(() => { setConfirmed(false); }, [order?.status]);

  const flush = useCallback(
    async (productId: string, units: number) => {
      delete timers.current[productId];
      delete pending.current[productId];
      try {
        let orderId = orderIdRef.current;
        if (!orderId) {
          // Share one in-flight get-or-create so quick changes create the draft once.
          draftPromise.current ??= draft.mutateAsync({ cafeId, productionDate }).then((id) => id as string);
          try { orderId = await draftPromise.current; } finally { draftPromise.current = null; }
        }
        await setItem.mutateAsync({ orderId, productId, units });
      } catch (err) {
        toast.error(kitchenErrorMessage(err, t));
        // Revert the optimistic value to what the server last told us.
        const server = orderRef.current?.items.find((i) => i.productId === productId)?.units ?? 0;
        if (!timers.current[productId]) setQty((q) => ({ ...q, [productId]: server }));
        void qc.invalidateQueries({ queryKey: ["kitchen"] });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cafeId, productionDate, t],
  );
  flushRef.current = flush;

  const apply = (id: string, v: number) => {
    setQty((q) => ({ ...q, [id]: v }));
    clearTimeout(timers.current[id]);
    pending.current[id] = v;
    timers.current[id] = setTimeout(() => void flush(id, v), DEBOUNCE_MS);
  };

  const change = (id: string, v: number) => {
    if (!canEdit) return;
    if (order?.status === "approved" && !confirmed) {
      setPendingEdit({ id, v });
      return;
    }
    apply(id, v);
  };

  const shownHidden = hiddenLines.filter((i) => (qty[i.productId] ?? i.units) > 0);
  const total =
    visible.reduce((s, p) => s + (qty[p.id] ?? 0), 0) +
    shownHidden.reduce((s, i) => s + (qty[i.productId] ?? i.units), 0);

  const handleSend = () => {
    if (!order) return;
    send.mutate({ orderId: order.id }, {
      onSuccess: () => toast.success(c.sentToast),
      onError: (err) => toast.error(kitchenErrorMessage(err, t)),
    });
  };

  const status = !order ? "none" : (order.status as "draft" | "sent" | "approved") ;
  const missed = !order || order.status === "draft";

  return (
    <>
      {!beforeCutoff && (
        <div role="status" className="mb-4 rounded-[26px] bg-brand-sand p-4 text-brand-ink">
          <p className="flex items-start gap-2 text-sm">
            <BrandShape kind="triangle" color="orange" size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{missed ? c.missedBanner : c.closedBanner}</span>
          </p>
        </div>
      )}

      {visible.length === 0 && <p className="text-sm text-muted-foreground">{c.noProducts}</p>}
      <ul className="divide-y divide-brand-line rounded-[26px] border border-brand-line bg-card px-4">
        {visible.map((p) => (
          <li key={p.id} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-bold">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.unitLabel} · {p.piecesPerUnit} {c.pcs}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.stockUnits === 0 ? c.stockZero : c.stockSome(p.stockUnits)}
                </p>
              </div>
              <QuantityStepper
                step={1}
                value={qty[p.id] ?? 0}
                disabled={!canEdit}
                onChange={(v) => change(p.id, v)}
                renderValue={(v) => String(v)}
                className="shrink-0 rounded-full bg-muted p-1"
              />
            </div>
            {(qty[p.id] ?? 0) > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                = {unitsToPieces(qty[p.id], p.piecesPerUnit)} {c.pcs}
              </p>
            )}
          </li>
        ))}
        {shownHidden.map((i) => (
          <li key={i.productId} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-bold">{i.productName}</p>
                <p className="text-sm text-muted-foreground">
                  {i.unitLabel} · {i.piecesPerUnit} {c.pcs}
                </p>
                <div className="mt-1"><StatusPill tone="orange">{c.noLongerAvailable}</StatusPill></div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular-nums">{qty[i.productId] ?? i.units}</span>
                <Button
                  variant="outline"
                  disabled={!canEdit}
                  aria-label={`${c.remove} ${i.productName}`}
                  onClick={() => change(i.productId, 0)}
                >
                  {c.remove}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {beforeCutoff && (
        <CafeCartBar
          totalUnits={total}
          status={status}
          countdown={formatCountdown(cutoff, now, lang)}
          cutoffLabel={formatWhen(cutoff, lang)}
          sending={send.isPending}
          onSend={handleSend}
        />
      )}

      <AlertDialog open={!!pendingEdit} onOpenChange={(o) => !o && setPendingEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{c.confirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingEdit) { setConfirmed(true); apply(pendingEdit.id, pendingEdit.v); }
                setPendingEdit(null);
              }}
            >
              {c.confirmOk}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
