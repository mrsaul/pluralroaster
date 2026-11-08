import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatVatRate } from "@/lib/orderUtils";
import type { OrderBreakdown } from "@/lib/pricing";

const eur = (n: number) => `€${n.toFixed(2)}`;

function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  green,
  strong,
}: {
  label: string;
  value: string;
  green?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 px-4 py-2 text-sm",
        green && "text-brand-green-600",
        strong && "font-semibold",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function PriceBreakdown({
  breakdown,
  className,
}: {
  breakdown: OrderBreakdown;
  className?: string;
}) {
  const t = useT();
  const { coffee, delivery, totalHT, vatLines, totalTTC } = breakdown;

  return (
    <div className={cn("divide-y divide-border rounded-xl border border-border bg-card", className)}>
      <div>
        <Heading>{t.breakdown.coffee}</Heading>
        <Row label={t.breakdown.publicPrice(String(coffee.kg))} value={eur(coffee.regularHT)} />
        {coffee.discountPercent > 0 && (
          <Row
            green
            label={t.breakdown.yourDiscount(String(coffee.discountPercent))}
            value={`−${eur(coffee.discountHT)}`}
          />
        )}
        <Row strong label={t.breakdown.yourCoffee} value={eur(coffee.netHT)} />
      </div>

      {delivery && (
        <div>
          <Heading>{t.breakdown.delivery}</Heading>
          <Row label={t.breakdown.loberz(delivery.bandLabel)} value={eur(delivery.fullPriceHT)} />
          {delivery.discountPercent > 0 && (
            <Row
              green
              label={delivery.free ? t.breakdown.freeDelivery : t.breakdown.pluralPays(String(delivery.discountPercent))}
              value={`−${eur(delivery.discountHT)}`}
            />
          )}
          <Row strong label={t.breakdown.yourDelivery} value={eur(delivery.netHT)} />
        </div>
      )}

      <div>
        <Heading>{t.breakdown.total}</Heading>
        <Row label={t.breakdown.totalHT} value={eur(totalHT)} />
        {vatLines.map((v) => (
          <Row key={v.rate} label={t.breakdown.vat(formatVatRate(v.rate))} value={eur(v.amount)} />
        ))}
        <Row strong label={t.breakdown.totalTTC} value={eur(totalTTC)} />
      </div>
    </div>
  );
}
