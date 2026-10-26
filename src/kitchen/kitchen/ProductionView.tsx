import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { useCurrentWeek, useKitchenOrders, useKitchenProducts, useKitchenSettings } from "../api";
import { useKitchenT } from "../i18n";
import { unitsToPieces } from "../lib/format";
import { computeCapacity, computeProduction } from "../lib/production";
import { buildProductionShareText } from "../lib/share";
import CapacityBar from "../stores/CapacityBar";
import WeekPicker from "../components/WeekPicker";
import { useShareText } from "../components/useShareText";

export default function ProductionView() {
  const k = useKitchenT().kitchen;
  const { lang } = useLang();
  const share = useShareText();
  const { data: current } = useCurrentWeek();
  const { data: settings } = useKitchenSettings();
  const { data: products = [] } = useKitchenProducts();
  const [picked, setPicked] = useState<string | null>(null);
  const weekStart = picked ?? current?.weekStart;
  const { data: orders = [] } = useKitchenOrders({ weekStart });
  const available = settings?.weeklyCapacityMinutes ?? 0;

  const rows = useMemo(() => computeProduction(orders.filter((o) => o.status === "approved"), products), [orders, products]);
  const capacity = useMemo(() => computeCapacity(rows, products, available), [rows, products, available]);
  const piecesPer = useMemo(() => new Map(products.map((p) => [p.id, p.piecesPerUnit])), [products]);

  if (!current || !weekStart) return <p className="p-4 text-sm text-muted-foreground">{k.loading}</p>;

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <WeekPicker weekStart={weekStart} currentWeekStart={current.weekStart} onChange={setPicked} />
      <CapacityBar neededMinutes={capacity.neededMinutes} availableMinutes={available} />
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{k.noApproved}</p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {rows.map((r) => {
              const ppu = piecesPer.get(r.productId) ?? 1;
              return (
                <li key={r.productId} className="rounded-xl border border-border bg-card p-3">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.byCafe.map((c) => `${c.cafeName} ${c.units}`).join(" · ")}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{k.ordered}</dt>
                      <dd>{r.orderedUnits} × {r.unitLabel}<span className="block text-xs text-muted-foreground">{unitsToPieces(r.orderedUnits, ppu)} {k.pcs}</span></dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{k.stock}</dt>
                      <dd>{r.stockUnits}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{k.toProduce}</dt>
                      <dd data-testid={`to-produce-${r.productId}`} className="font-bold">
                        {r.toProduceUnits} × {r.unitLabel}
                        <span className="block text-xs font-normal text-muted-foreground">{unitsToPieces(r.toProduceUnits, ppu)} {k.pcs}</span>
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <Button className="mt-4 h-12 w-full" onClick={() => void share(buildProductionShareText(weekStart, rows, lang))}>
            <Share2 className="mr-2 h-4 w-4" />{k.shareProduction}
          </Button>
        </>
      )}
    </div>
  );
}
