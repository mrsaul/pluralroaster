import { useKitchenT } from "../i18n";
import { formatMinutes } from "../lib/format";

type Props = { neededMinutes: number; availableMinutes: number; previewMinutes?: number };

/** Production hours needed vs available; turns red and says "over by X" when over. */
export default function CapacityBar({ neededMinutes, availableMinutes, previewMinutes }: Props) {
  const s = useKitchenT().stores;
  const worst = Math.max(neededMinutes, previewMinutes ?? 0);
  const over = worst > availableMinutes;
  const pct = (m: number) => (availableMinutes > 0 ? Math.min(100, (m / availableMinutes) * 100) : m > 0 ? 100 : 0);
  return (
    <div data-over={over} className={`rounded-xl border p-3 ${over ? "border-destructive bg-destructive/10 text-destructive" : "border-border bg-card"}`}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{s.capacityTitle}</span>
        <span className="font-mono tabular-nums">{formatMinutes(neededMinutes)} / {formatMinutes(availableMinutes)}</span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted">
        {previewMinutes !== undefined && (
          <div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${pct(previewMinutes)}%` }} />
        )}
        <div className={`absolute inset-y-0 left-0 ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct(neededMinutes)}%` }} />
      </div>
      {previewMinutes !== undefined && previewMinutes !== neededMinutes && (
        <p className="mt-1 text-xs">{s.previewIfApproved(formatMinutes(previewMinutes))}</p>
      )}
      {over && <p role="alert" className="mt-1 text-sm font-medium">{s.overBy(formatMinutes(worst - availableMinutes))}</p>}
    </div>
  );
}
