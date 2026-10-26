import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addDays, format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { useLang, type Lang } from "@/i18n";
import {
  kitchenErrorMessage, useCreateOrderForCafe, useCurrentWeek, useKitchenCafes, useKitchenOrders,
  useKitchenProducts, useKitchenSettings,
} from "../api";
import { useKitchenT } from "../i18n";
import { computeCapacity, computeProduction } from "../lib/production";
import { formatWhen, useNow } from "../cafe/useNow";
import type { KitchenOrder } from "../types";
import CapacityBar from "./CapacityBar";
import OrderReviewSheet from "./OrderReviewSheet";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function Badge({ n }: { n: number }) {
  const s = useKitchenT().stores;
  return n > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-950">{s.urgentCount(n)}</span> : null;
}

function Row({ o, flag, n, lang, onOpen }: { o: KitchenOrder; flag?: string; n: number; lang: Lang; onOpen: (id: string) => void }) {
  const s = useKitchenT().stores;
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{o.cafeName}</p>
        <p className="text-xs text-muted-foreground">
          {s.itemsCount(o.items.length)}{o.neededBy ? ` · ${s.neededBy(formatWhen(o.neededBy, lang))}` : ""}
        </p>
        {flag && <p className="text-xs font-medium text-destructive">{flag}</p>}
        <Badge n={n} />
      </div>
      <Button className="h-11" onClick={() => onOpen(o.id)}>{s.review}</Button>
    </li>
  );
}

export default function StoresReview() {
  const t = useKitchenT();
  const s = t.stores;
  const { lang } = useLang();
  const now = useNow();
  const { data: current } = useCurrentWeek();
  const { data: settings } = useKitchenSettings();
  const { data: products = [] } = useKitchenProducts();
  const { data: cafes = [] } = useKitchenCafes();
  const [picked, setPicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const weekStart = picked ?? current?.weekStart;
  const { data: weekly = [] } = useKitchenOrders({ weekStart, kind: "weekly" });
  const { data: urgentAll = [] } = useKitchenOrders({ kind: "urgent" });
  const create = useCreateOrderForCafe();

  // Cutoff: the current week uses the server cutoff; past weeks are after it, future weeks before.
  const afterCutoff = !!current && !!weekStart && (
    weekStart === current.weekStart ? now >= new Date(current.cutoffAt) : weekStart < current.weekStart
  );

  const urgentWaiting = useMemo(
    () => urgentAll.filter((o) => o.status === "sent").sort((a, b) => (a.neededBy ?? "").localeCompare(b.neededBy ?? "")),
    [urgentAll],
  );
  const urgentCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!current) return m;
    const from = iso(addDays(parseISO(current.weekStart), -49));
    for (const o of urgentAll) if (o.weekStart >= from) m.set(o.cafeId, (m.get(o.cafeId) ?? 0) + 1);
    return m;
  }, [urgentAll, current]);

  const toReview = weekly.filter((o) => o.status === "sent");
  const approved = weekly.filter((o) => ["approved", "ready", "received"].includes(o.status));
  const notSent = cafes.filter((c) => c.isActive && !weekly.some((o) => o.cafeId === c.id && o.status !== "draft"));

  const counted = useMemo(
    () => [...weekly, ...urgentAll.filter((o) => o.weekStart === weekStart)].filter((o) => o.status === "approved"),
    [weekly, urgentAll, weekStart],
  );
  const available = settings?.weeklyCapacityMinutes ?? 0;
  const capacity = useMemo(() => computeCapacity(computeProduction(counted, products), products, available), [counted, products, available]);

  if (!current || !weekStart) return <p className="p-4 text-sm text-muted-foreground">{s.loading}</p>;

  const shift = (days: number) => setPicked(iso(addDays(parseISO(weekStart), days)));
  const openOrder = [...weekly, ...urgentAll].find((o) => o.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" className="h-11" onClick={() => shift(-7)}>{s.prevWeek}</Button>
        <span className="text-sm font-medium">{s.weekOf(format(parseISO(weekStart), "dd/MM"))}</span>
        <Button variant="outline" className="h-11" onClick={() => shift(7)}>{s.nextWeek}</Button>
      </div>
      {weekStart !== current.weekStart && (
        <Button variant="ghost" className="mb-2 h-9" onClick={() => setPicked(null)}>{s.thisWeek}</Button>
      )}
      <CapacityBar neededMinutes={capacity.neededMinutes} availableMinutes={available} />

      <Section title={s.sectionUrgent}>
        {urgentWaiting.length === 0 && <li className="text-sm text-muted-foreground">{s.empty}</li>}
        {urgentWaiting.map((o) => <Row key={o.id} o={o} n={urgentCounts.get(o.cafeId) ?? 0} lang={lang} onOpen={setOpenId} />)}
      </Section>
      <Section title={s.sectionReview}>
        {toReview.length === 0 && <li className="text-sm text-muted-foreground">{s.empty}</li>}
        {toReview.map((o) => <Row key={o.id} o={o} n={urgentCounts.get(o.cafeId) ?? 0} lang={lang} onOpen={setOpenId} flag={afterCutoff ? s.flagNotApproved : undefined} />)}
      </Section>
      <Section title={s.sectionApproved}>
        {approved.length === 0 && <li className="text-sm text-muted-foreground">{s.empty}</li>}
        {approved.map((o) => <Row key={o.id} o={o} n={urgentCounts.get(o.cafeId) ?? 0} lang={lang} onOpen={setOpenId} />)}
      </Section>
      <Section title={s.sectionNotSent}>
        {notSent.length === 0 && <li className="text-sm text-muted-foreground">{s.empty}</li>}
        {notSent.map((c) => {
          const draft = weekly.find((o) => o.cafeId === c.id && o.status === "draft");
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-medium">{c.name}</p>
                {afterCutoff && <p className="text-xs font-medium text-destructive">{s.flagNotSent}</p>}
                <Badge n={urgentCounts.get(c.id) ?? 0} />
              </div>
              <Button
                variant="outline"
                className="h-11"
                disabled={create.isPending}
                onClick={() => {
                  if (draft) { setOpenId(draft.id); return; }
                  create.mutate({ cafeId: c.id, weekStart }, {
                    onSuccess: (id) => setOpenId(id as string),
                    onError: (err) => toast.error(kitchenErrorMessage(err, t)),
                  });
                }}
              >
                {draft ? s.editDraft : s.createOrder}
              </Button>
            </li>
          );
        })}
      </Section>

      {openOrder && (
        <OrderReviewSheet
          key={openOrder.id}
          order={openOrder}
          products={products}
          availableMinutes={available}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
