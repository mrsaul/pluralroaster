import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addDays, format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/i18n";
import { useKitchenLang } from "@/kitchen/i18n";
import {
  kitchenErrorMessage, useCreateOrderForCafe, useKitchenCafes, useKitchenOrders,
  useKitchenProducts, useKitchenRounds, useRoundOccurrences,
} from "../api";
import { useKitchenT } from "../i18n";
import { computeCapacity, computeProduction } from "../lib/production";
import { isAfterCutoff, parisDate, storesDefaultRound } from "../lib/rounds";
import { formatWhen, useNow } from "../cafe/useNow";
import UrgentOrderSheet from "../cafe/UrgentOrderSheet";
import type { KitchenOrder } from "../types";
import RoundPicker from "../components/RoundPicker";
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
  const lang = useKitchenLang();
  const now = useNow();
  const { data: products = [] } = useKitchenProducts();
  const { data: cafes = [] } = useKitchenCafes();
  const today = parisDate(now);
  const { data: occurrences = [] } = useRoundOccurrences(
    iso(addDays(parseISO(today), -28)),
    iso(addDays(parseISO(today), 28)),
  );
  // Selection is stored as a production date so refetches never swap the viewed round.
  const [picked, setPicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [urgentOpen, setUrgentOpen] = useState(false);
  const defaultRound = useMemo(() => storesDefaultRound(occurrences, now), [occurrences, now]);
  const round = occurrences.find((o) => o.productionDate === picked) ?? defaultRound;
  const productionDate = round?.productionDate;
  const { data: weekly = [] } = useKitchenOrders({ productionDate, kind: "weekly" });
  const { data: urgentAll = [] } = useKitchenOrders({ kind: "urgent" });
  const { data: allRounds = [] } = useKitchenRounds();
  const create = useCreateOrderForCafe();
  const activeCafes = useMemo(() => cafes.filter((c) => c.isActive), [cafes]);

  const afterCutoff = !!round && isAfterCutoff(round, now);

  // Opening an order pins the viewed round, so approving the last sent order does not
  // switch the default round (and close the sheet) underneath the stores manager.
  const openOrderSheet = (id: string) => {
    setPicked((p) => p ?? productionDate ?? null);
    setOpenId(id);
  };

  const urgentWaiting = useMemo(
    () => urgentAll.filter((o) => o.status === "sent").sort((a, b) => (a.neededBy ?? "").localeCompare(b.neededBy ?? "")),
    [urgentAll],
  );
  const urgentCounts = useMemo(() => {
    const m = new Map<string, number>();
    const from = iso(addDays(parseISO(today), -56));
    for (const o of urgentAll) if (o.productionDate >= from) m.set(o.cafeId, (m.get(o.cafeId) ?? 0) + 1);
    return m;
  }, [urgentAll, today]);

  const toReview = weekly.filter((o) => o.status === "sent");
  const approved = weekly.filter((o) => ["approved", "ready", "received"].includes(o.status));
  const notSent = cafes.filter((c) => c.isActive && !weekly.some((o) => o.cafeId === c.id && o.status !== "draft"));

  const counted = useMemo(
    () => [...weekly, ...urgentAll.filter((o) => o.productionDate === productionDate)].filter((o) => o.status === "approved"),
    [weekly, urgentAll, productionDate],
  );
  const available = round?.capacityMinutes ?? 0;
  const capacity = useMemo(() => computeCapacity(computeProduction(counted, products), products, available), [counted, products, available]);

  if (!round || !productionDate) return <p className="p-4 text-sm text-muted-foreground">{occurrences.length ? s.loading : s.noRound}</p>;

  const openOrder = [...weekly, ...urgentAll].find((o) => o.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <RoundPicker occurrences={occurrences} value={productionDate} onChange={setPicked} defaultValue={defaultRound?.productionDate ?? null} />
      <CapacityBar neededMinutes={capacity.neededMinutes} availableMinutes={available} />
      <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => setUrgentOpen(true)}>{s.newUrgent}</Button>

      <Section title={s.sectionUrgent}>
        {urgentWaiting.length === 0 && <li className="text-sm text-muted-foreground">{s.empty}</li>}
        {urgentWaiting.map((o) => <Row key={o.id} o={o} n={urgentCounts.get(o.cafeId) ?? 0} lang={lang} onOpen={openOrderSheet} />)}
      </Section>
      <Section title={s.sectionReview}>
        {toReview.length === 0 && <li className="text-sm text-muted-foreground">{s.empty}</li>}
        {toReview.map((o) => <Row key={o.id} o={o} n={urgentCounts.get(o.cafeId) ?? 0} lang={lang} onOpen={openOrderSheet} flag={afterCutoff ? s.flagNotApproved : undefined} />)}
      </Section>
      <Section title={s.sectionApproved}>
        {approved.length === 0 && <li className="text-sm text-muted-foreground">{s.empty}</li>}
        {approved.map((o) => <Row key={o.id} o={o} n={urgentCounts.get(o.cafeId) ?? 0} lang={lang} onOpen={openOrderSheet} />)}
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
                  if (draft) { openOrderSheet(draft.id); return; }
                  create.mutate({ cafeId: c.id, productionDate }, {
                    onSuccess: (id) => openOrderSheet(id as string),
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
          availableMinutes={
            occurrences.find((o) => o.productionDate === openOrder.productionDate)?.capacityMinutes ??
            allRounds.find((r) => r.id === openOrder.roundId)?.capacityMinutes ??
            null
          }
          onClose={() => setOpenId(null)}
        />
      )}
      <UrgentOrderSheet open={urgentOpen} onOpenChange={setUrgentOpen} cafes={activeCafes} products={products} />
    </div>
  );
}
