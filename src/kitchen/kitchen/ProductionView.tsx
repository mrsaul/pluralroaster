import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKitchenLang } from "@/kitchen/i18n";
import { useKitchenOrders, useKitchenProducts, useRoundOccurrences } from "../api";
import { useKitchenT } from "../i18n";
import { unitsToPieces } from "../lib/format";
import { computeCapacity, computeProduction } from "../lib/production";
import { buildProductionShareText } from "../lib/share";
import { kitchenDefaultRound, parisDate } from "../lib/rounds";
import { useNow } from "../cafe/useNow";
import CapacityBar from "../stores/CapacityBar";
import RoundPicker from "../components/RoundPicker";
import { useShareText } from "../components/useShareText";

export default function ProductionView() {
  const k = useKitchenT().kitchen;
  const lang = useKitchenLang();
  const share = useShareText();
  const now = useNow();
  const today = parisDate(now);
  const { data: occurrences = [] } = useRoundOccurrences(
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
  const available = round?.capacityMinutes ?? 0;

  const rows = useMemo(() => computeProduction(orders.filter((o) => o.status === "approved"), products), [orders, products]);
  const capacity = useMemo(() => computeCapacity(rows, products, available), [rows, products, available]);
  const piecesPer = useMemo(() => new Map(products.map((p) => [p.id, p.piecesPerUnit])), [products]);

  if (!round || !productionDate) return <p className="p-4 text-sm text-muted-foreground">{occurrences.length ? k.loading : k.noRound}</p>;

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <RoundPicker occurrences={occurrences} value={productionDate} onChange={setPicked} defaultValue={defaultRound?.productionDate ?? null} />
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
          <Button className="mt-4 h-12 w-full" onClick={() => void share(buildProductionShareText(productionDate, rows, lang))}>
            <Share2 className="mr-2 h-4 w-4" />{k.shareProduction}
          </Button>
        </>
      )}
    </div>
  );
}
