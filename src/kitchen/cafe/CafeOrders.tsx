import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { kitchenErrorMessage, useKitchenOrders, useMarkReceived } from "../api";
import { useKitchenT } from "../i18n";
import { unitsToPieces } from "../lib/format";
import { effectiveUnits } from "../lib/production";
import { buildOrderShareText } from "../lib/share";
import type { KitchenOrder } from "../types";
import { formatWhen } from "./useNow";

const STEPS: KitchenOrder["status"][] = ["draft", "sent", "approved", "ready", "received"];

function StatusSteps({ order }: { order: KitchenOrder }) {
  const t = useKitchenT().cafeApp;
  if (order.status === "declined") {
    return <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{t.status.declined}</span>;
  }
  const steps = order.kind === "urgent" ? STEPS.slice(1) : STEPS;
  const idx = steps.indexOf(order.status);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="status">
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === idx ? "step" : undefined}
          className={i === idx ? "rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground" : i < idx ? "text-foreground" : "text-muted-foreground"}
        >
          {order.kind === "urgent" && s === "sent" && i === idx ? t.waitingApproval : t.status[s]}
          {i < steps.length - 1 && <span className="ml-1 text-muted-foreground">›</span>}
        </li>
      ))}
    </ol>
  );
}

function OrderCard({ order }: { order: KitchenOrder }) {
  const t = useKitchenT();
  const c = t.cafeApp;
  const { lang } = useLang();
  const received = useMarkReceived();

  const share = async () => {
    const text = buildOrderShareText(order, lang);
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") await navigator.clipboard?.writeText(text).catch(() => {});
      }
    } else {
      await navigator.clipboard?.writeText(text).catch(() => {});
      toast.success(c.copied);
    }
  };

  const title = order.kind === "urgent" ? c.urgentOrder : c.orderWeek(format(parseISO(order.weekStart), "dd/MM"));

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{title}</p>
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={c.share} onClick={() => void share()}>
          <Share2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2"><StatusSteps order={order} /></div>
      {order.kind === "urgent" && order.urgentReason && (
        <p className="mt-2 text-sm text-muted-foreground">{c.reason} : {order.urgentReason}</p>
      )}
      {order.kind === "urgent" && order.status === "approved" && order.readyEta && (
        <p className="mt-2 text-sm font-medium">{c.kitchenReady(formatWhen(order.readyEta, lang))}</p>
      )}
      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {order.items.map((it) => {
          const adjusted = it.adjustedUnits !== null && it.adjustedUnits !== it.units;
          const eff = effectiveUnits(it);
          return (
            <li key={it.productId} className="flex justify-between gap-2">
              <span>{it.productName}</span>
              <span className="tabular-nums text-muted-foreground">
                {adjusted ? `${it.units} → ${eff}` : eff} × {it.unitLabel} ({unitsToPieces(eff, it.piecesPerUnit)} {c.pcs})
              </span>
            </li>
          );
        })}
      </ul>
      {order.status === "ready" && (
        <Button
          className="mt-3 h-12 w-full"
          disabled={received.isPending}
          onClick={() =>
            received.mutate({ orderId: order.id }, { onError: (err) => toast.error(kitchenErrorMessage(err, t)) })
          }
        >
          {c.confirmReceived}
        </Button>
      )}
    </li>
  );
}

export default function CafeOrders({ cafeId }: { cafeId: string }) {
  const c = useKitchenT().cafeApp;
  const { data = [], isLoading } = useKitchenOrders({ cafeId });
  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">{c.loading}</p>;
  const list = [...data].reverse(); // api returns oldest first
  return (
    <div className="mx-auto max-w-xl px-4 pb-8 pt-4">
      {list.length === 0 && <p className="text-sm text-muted-foreground">{c.noOrders}</p>}
      <ul className="flex flex-col gap-3">
        {list.map((o) => <OrderCard key={o.id} order={o} />)}
      </ul>
    </div>
  );
}
