import { useKitchenT } from "../i18n";
import { formatMinutes } from "../lib/format";
import { BrandShape } from "../ui/BrandShape";
import { SectionHeading, SECTION_SHAPES } from "../ui/SectionHeading";

type Props = { neededMinutes: number; availableMinutes: number | null; previewMinutes?: number };

/** Production hours needed vs available; coral fill and an "over by X" pill when over. */
export default function CapacityBar({ neededMinutes, availableMinutes: availableOrNull, previewMinutes }: Props) {
  const s = useKitchenT().stores;
  // Unknown capacity (round data missing): show "—" and never warn about an overrun.
  const unknown = availableOrNull === null;
  const availableMinutes = availableOrNull ?? 0;
  const worst = Math.max(neededMinutes, previewMinutes ?? 0);
  const over = !unknown && worst > availableMinutes;
  const pct = (m: number) => (availableMinutes > 0 ? Math.min(100, (m / availableMinutes) * 100) : m > 0 ? 100 : 0);
  const { shape, color } = SECTION_SHAPES.capacity;
  return (
    <section data-over={over} className="mb-4">
      <SectionHeading
        shape={shape}
        color={color}
        title={s.capacityTitle}
        action={<span className="text-[14px] font-semibold tabular-nums text-brand-ink">{formatMinutes(neededMinutes)} / {unknown ? "—" : formatMinutes(availableMinutes)}</span>}
      />
      <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
        {previewMinutes !== undefined && (
          <div className="absolute inset-y-0 left-0 bg-brand-orange-200" style={{ width: `${pct(previewMinutes)}%` }} />
        )}
        <div className={`absolute inset-y-0 left-0 ${over ? "bg-brand-coral" : "bg-brand-orange"}`} style={{ width: `${pct(neededMinutes)}%` }} />
      </div>
      {previewMinutes !== undefined && previewMinutes !== neededMinutes && (
        <p className="mt-1.5 text-xs text-muted-foreground">{s.previewIfApproved(formatMinutes(previewMinutes))}</p>
      )}
      {over && (
        <p role="alert" className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-coral-100 px-3 py-1 text-sm font-semibold text-brand-ink">
          <BrandShape kind="triangle" color="coral" size={14} className="shrink-0" />
          {s.overBy(formatMinutes(worst - availableMinutes))}
        </p>
      )}
    </section>
  );
}
