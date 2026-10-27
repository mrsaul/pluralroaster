import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { QuantityStepper } from "@/components/QuantityStepper";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKitchenLang } from "@/kitchen/i18n";
import {
  kitchenErrorMessage, useCurrentWeek, useGetOrCreateDraft, useKitchenOrders,
  useKitchenProducts, useSendOrder, useSetItem,
} from "../api";
import { useKitchenT } from "../i18n";
import { formatCountdown, unitsToPieces } from "../lib/format";
import CafeCartBar from "./CafeCartBar";
import UrgentOrderSheet from "./UrgentOrderSheet";
import { formatWhen, useNow } from "./useNow";

const DEBOUNCE_MS = 400;

export default function CafeHome({ cafeId, cafeName }: { cafeId: string; cafeName: string | null }) {
  const t = useKitchenT();
  const c = t.cafeApp;
  const lang = useKitchenLang();
  const qc = useQueryClient();
  const now = useNow();

  const { data: products = [], isLoading } = useKitchenProducts();
  const { data: week } = useCurrentWeek();
  const { data: orders = [] } = useKitchenOrders({ weekStart: week?.weekStart, cafeId, kind: "weekly" });
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
  const cutoff = week ? new Date(week.cutoffAt) : null;
  const beforeCutoff = !!cutoff && now < cutoff;
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
  const [urgentOpen, setUrgentOpen] = useState(false);
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
          draftPromise.current ??= draft.mutateAsync({ cafeId }).then((id) => id as string);
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
    [cafeId, t],
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

  if (isLoading || !week) return <p className="p-4 text-sm text-muted-foreground">{c.loading}</p>;

  const status = !order ? "none" : (order.status as "draft" | "sent" | "approved") ;
  const missed = !order || order.status === "draft";

  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-4">
      {cafeName && <p className="mb-3 text-sm text-muted-foreground">{cafeName}</p>}

      <Button variant="outline" className="mb-4 h-12 w-full" onClick={() => setUrgentOpen(true)}>{c.urgentButton}</Button>

      {!beforeCutoff && (
        <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {missed ? c.missedBanner : c.closedBanner}
          </p>
        </div>
      )}

      {visible.length === 0 && <p className="text-sm text-muted-foreground">{c.noProducts}</p>}
      <ul className="flex flex-col gap-3">
        {visible.map((p) => (
          <li key={p.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
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
          <li key={i.productId} className="rounded-xl border border-dashed border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{i.productName}</p>
                <p className="text-sm text-muted-foreground">
                  {i.unitLabel} · {i.piecesPerUnit} {c.pcs}
                </p>
                <p className="text-xs font-medium text-amber-700">{c.noLongerAvailable}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{qty[i.productId] ?? i.units}</span>
                <Button
                  variant="outline"
                  className="h-11"
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
          countdown={formatCountdown(cutoff!, now, lang)}
          cutoffLabel={formatWhen(cutoff!, lang)}
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

      <UrgentOrderSheet open={urgentOpen} onOpenChange={setUrgentOpen} cafeId={cafeId} products={visible} />
    </div>
  );
}
