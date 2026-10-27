import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { QuantityStepper } from "@/components/QuantityStepper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useKitchenLang } from "@/kitchen/i18n";
import {
  kitchenErrorMessage, notifyKitchen, useAdjustItem, useApproveOrder, useDeclineOrder, useLockOrder,
  useKitchenOrders, useSendOrder, useSetItem, useUnlockOrder, type KitchenChange,
} from "../api";
import { useKitchenT } from "../i18n";
import { unitsToPieces } from "../lib/format";
import { capacityIfApproved, computeCapacity, computeProduction, effectiveUnits } from "../lib/production";
import { buildChangesShareText } from "../lib/share";
import type { KitchenOrder, KitchenProduct } from "../types";
import CapacityBar from "./CapacityBar";

const DEBOUNCE_MS = 400;

type Props = {
  order: KitchenOrder;
  products: KitchenProduct[];
  availableMinutes: number;
  onClose: () => void;
};

export default function OrderReviewSheet({ order, products, availableMinutes, onClose }: Props) {
  const t = useKitchenT();
  const s = t.stores;
  const lang = useKitchenLang();
  const { data: weekOrders = [] } = useKitchenOrders({ weekStart: order.weekStart });
  const orders = useMemo(() => weekOrders.filter((o) => o.status === "approved"), [weekOrders]);
  const lock = useLockOrder();
  const unlock = useUnlockOrder();
  const adjust = useAdjustItem();
  const setItem = useSetItem();
  const approve = useApproveOrder();
  const decline = useDeclineOrder();
  const send = useSendOrder();

  const isDraft = order.status === "draft";
  const [lockError, setLockError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [changes, setChanges] = useState<KitchenChange[] | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, number>>({});
  const orderRef = useRef(order);
  orderRef.current = order;
  const flushRef = useRef<(id: string, v: number) => Promise<boolean>>(async () => true);
  const unlockRef = useRef(unlock.mutate);
  unlockRef.current = unlock.mutate;
  const lockRef = useRef<Promise<boolean> | null>(null);
  const flushAllRef = useRef<() => Promise<boolean>>(async () => true);
  // Set when an adjustment of an already-approved order is saved: the café is told once, on close.
  const adjustedApproved = useRef(false);

  // Lock on open; on unmount wait for the lock, flush pending edits, then unlock.
  useEffect(() => {
    const lockPromise = lock.mutateAsync({ orderId: order.id }).then(
      () => true,
      (err) => { setLockError(kitchenErrorMessage(err, t)); return false; },
    );
    lockRef.current = lockPromise;
    return () => {
      void lockPromise
        .then(async (ok) => {
          if (!ok) return;
          try {
            await flushAllRef.current();
            if (adjustedApproved.current) void notifyKitchen("order_approved", order.id);
          } finally { unlockRef.current({ orderId: order.id }); }
        })
        .catch((err) => console.warn("[OrderReviewSheet] unlock", err));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  // Sync server quantities, except for products with an edit in flight.
  useEffect(() => {
    setQty((prev) => {
      const next = { ...prev };
      for (const it of order.items) if (!timers.current[it.productId]) next[it.productId] = isDraft ? it.units : effectiveUnits(it);
      return next;
    });
  }, [order, isDraft]);

  const readOnly = lockError !== null || !["draft", "sent", "approved"].includes(order.status) || !!changes;

  const flush = async (productId: string, units: number): Promise<boolean> => {
    delete timers.current[productId];
    delete pending.current[productId];
    try {
      if (orderRef.current.status === "draft") await setItem.mutateAsync({ orderId: order.id, productId, units });
      else {
        await adjust.mutateAsync({ orderId: order.id, productId, adjustedUnits: units });
        if (orderRef.current.status === "approved") adjustedApproved.current = true;
      }
      return true;
    } catch (err) {
      toast.error(kitchenErrorMessage(err, t));
      const it = orderRef.current.items.find((i) => i.productId === productId);
      if (!timers.current[productId]) setQty((q) => ({ ...q, [productId]: it ? effectiveUnits(it) : 0 }));
      return false;
    }
  };
  flushRef.current = flush;

  const change = (productId: string, v: number) => {
    if (readOnly) return;
    setQty((q) => ({ ...q, [productId]: v }));
    clearTimeout(timers.current[productId]);
    pending.current[productId] = v;
    timers.current[productId] = setTimeout(() => void flush(productId, v), DEBOUNCE_MS);
  };

  const flushAll = async () => {
    const entries = Object.entries(pending.current);
    for (const [id] of entries) clearTimeout(timers.current[id]);
    const results = await Promise.all(entries.map(([id, v]) => flush(id, v)));
    return results.every(Boolean);
  };
  flushAllRef.current = flushAll;

  // Lines: existing items, then added ones.
  const lineIds = useMemo(() => {
    const ids = order.items.map((i) => i.productId);
    for (const id of extra) if (!ids.includes(id)) ids.push(id);
    return ids;
  }, [order.items, extra]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const addable = products.filter((p) => !lineIds.includes(p.id));

  // Capacity preview using the local (not yet saved) quantities.
  const preview = useMemo(() => {
    const items = lineIds.map((id) => {
      const it = order.items.find((i) => i.productId === id);
      const p = byId.get(id);
      const base = it ?? {
        productId: id, productName: p?.name ?? "", unitLabel: p?.unitLabel ?? "", piecesPerUnit: p?.piecesPerUnit ?? 1,
        units: 0, adjustedUnits: null, servedFromStockUnits: 0,
      };
      return { ...base, adjustedUnits: qty[id] ?? effectiveUnits(base) };
    });
    return capacityIfApproved(orders, { ...order, items }, products, availableMinutes);
  }, [orders, order, lineIds, qty, products, byId, availableMinutes]);
  const current = useMemo(
    () => computeCapacity(computeProduction(orders.filter((o) => o.id !== order.id || order.status === "approved"), products), products, availableMinutes),
    [orders, order, products, availableMinutes],
  );

  const share = async (list: KitchenChange[]) => {
    const text = buildChangesShareText(order.cafeName, list.map((c) => ({ productName: c.product_name, from: c.from, to: c.to })), lang);
    if (navigator.share) {
      try { await navigator.share({ text }); } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") await navigator.clipboard?.writeText(text).catch(() => {});
      }
    } else {
      await navigator.clipboard?.writeText(text).catch(() => {});
      toast.success(s.copied);
    }
  };

  const doApprove = async () => {
    if (!(await flushAll())) return;
    approve.mutate({ orderId: order.id }, {
      onSuccess: (data) => {
        toast.success(s.approvedToast);
        const list = data?.changes ?? [];
        if (list.length > 0) setChanges(list); else onClose();
      },
      onError: (err) => toast.error(kitchenErrorMessage(err, t)),
    });
  };
  const doSend = async () => {
    if (!(await flushAll())) return;
    send.mutate({ orderId: order.id }, { onError: (err) => toast.error(kitchenErrorMessage(err, t)) });
  };
  const doDecline = () => {
    decline.mutate({ orderId: order.id, note: note.trim() }, {
      onSuccess: () => { toast.success(s.declinedToast); onClose(); },
      onError: (err) => toast.error(kitchenErrorMessage(err, t)),
    });
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{s.sheetTitle(order.cafeName)}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4">
          {lockError && <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">{lockError} ({s.readOnly})</p>}
          {order.urgentReason && <p className="text-sm text-muted-foreground">{order.urgentReason}</p>}
          <CapacityBar neededMinutes={current.neededMinutes} availableMinutes={availableMinutes} previewMinutes={order.status === "approved" ? undefined : preview.neededMinutes} />

          <ul className="flex flex-col gap-2">
            {lineIds.map((id) => {
              const p = byId.get(id);
              const it = order.items.find((i) => i.productId === id);
              const v = qty[id] ?? (it ? effectiveUnits(it) : 0);
              return (
                <li key={id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {it?.productName ?? p?.name}
                      {p && !p.isVisible && <span className="ml-1 text-xs text-muted-foreground">({s.hidden})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.cafeAsked(it?.units ?? 0)} · {unitsToPieces(v, it?.piecesPerUnit ?? p?.piecesPerUnit ?? 1)} {t.cafeApp.pcs}
                    </p>
                  </div>
                  <QuantityStepper step={1} value={v} disabled={readOnly} onChange={(n) => change(id, n)} renderValue={(n) => String(n)} />
                </li>
              );
            })}
          </ul>

          {!readOnly && (
            <div>
              <Button variant="outline" className="h-11" onClick={() => setAdding((a) => !a)}>{s.addProduct}</Button>
              {adding && (
                <ul className="mt-2 flex flex-col gap-1">
                  {addable.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full rounded-md border border-border px-3 py-2 text-left text-sm"
                        onClick={() => { setExtra((e) => [...e, p.id]); change(p.id, 1); setAdding(false); }}
                      >
                        {p.name}{!p.isVisible && <span className="ml-1 text-xs text-muted-foreground">({s.hidden})</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {changes && (
            <div role="status" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-medium">{s.approvedChanges}</p>
              <ul className="text-sm">
                {changes.map((c) => <li key={c.product_name}>{c.product_name}: {c.from} → {c.to}</li>)}
              </ul>
              <Button className="h-12" onClick={() => void share(changes)}><Share2 className="mr-2 h-4 w-4" />{s.shareChanges}</Button>
              <Button variant="outline" className="h-11" onClick={onClose}>{s.close}</Button>
            </div>
          )}

          {!changes && !lockError && (
            <div className="flex flex-col gap-2">
              {isDraft && <Button className="h-12" disabled={send.isPending} onClick={() => void doSend()}>{s.send}</Button>}
              {order.status === "sent" && (
                <Button className="h-12" disabled={approve.isPending} onClick={() => void doApprove()}>{s.approve}</Button>
              )}
              {order.kind === "urgent" && order.status === "sent" && (
                declining ? (
                  <>
                    <Textarea aria-label={s.declineNote} placeholder={s.declineNote} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
                    <Button variant="destructive" className="h-12" disabled={note.trim() === "" || decline.isPending} onClick={doDecline}>{s.declineConfirm}</Button>
                  </>
                ) : (
                  <Button variant="outline" className="h-12" onClick={() => setDeclining(true)}>{s.decline}</Button>
                )
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
