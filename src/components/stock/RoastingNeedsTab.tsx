import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PercentChip } from "@/components/stock/PercentChip";
import { RoastedSheet } from "@/components/stock/RoastedSheet";
import type { RoastingNeed } from "@/lib/roasting";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function RoastingNeedsTab({
  needs,
  error,
  isLoading,
  defaultPercent,
}: {
  needs: RoastingNeed[] | null;
  error: Error | null;
  isLoading: boolean;
  defaultPercent: number | undefined;
}) {
  const [sheetNeed, setSheetNeed] = useState<RoastingNeed | null>(null);

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Impossible de calculer le torréfié : {error.message}
      </p>
    );
  }
  if (isLoading || !needs) {
    return <p className="text-sm text-muted-foreground">Calcul en cours…</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Vert = torréfié + % de perte</span>
        {defaultPercent !== undefined && <PercentChip scope="default" percent={defaultPercent} />}
      </div>

      {needs.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Rien à torréfier : le stock couvre toutes les commandes.
        </p>
      ) : (
        <ul aria-label="À torréfier" className="space-y-3">
          {needs.map((n) => (
            <li key={n.productId} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-foreground break-words">{n.productName}</h3>
              <div className="space-y-1.5">
                <Row label="Commandes à conditionner">
                  <span className="tabular-nums">{n.neededKg.toFixed(2)} kg</span>
                </Row>
                <Row label="En stock">
                  <span className="tabular-nums">− {n.stockKg.toFixed(2)} kg</span>
                </Row>
                <Row label="À torréfier">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">{n.toRoastKg.toFixed(2)} kg</span>
                </Row>
                <Row label="Vert à peser">
                  <span className="flex items-center gap-2">
                    <PercentChip
                      scope="product"
                      productId={n.productId}
                      productName={n.productName}
                      percent={n.percent}
                      isCustom={n.percentIsCustom}
                    />
                    <span className="text-2xl font-semibold tabular-nums text-brand-green-600">{n.greenKg.toFixed(2)} kg</span>
                  </span>
                </Row>
              </div>
              <Button
                className="h-11 w-full"
                aria-label={`Torréfié ${n.productName}`}
                onClick={() => setSheetNeed(n)}
              >
                Torréfié ✓
              </Button>
            </li>
          ))}
        </ul>
      )}

      <RoastedSheet need={sheetNeed} onClose={() => setSheetNeed(null)} />
    </div>
  );
}
