import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKitchenLang } from "@/kitchen/i18n";
import { useKitchenT } from "../i18n";
import { formatRoundLabel } from "../lib/rounds";
import type { RoundOccurrence } from "../types";

/** Round chip: round icon buttons around the round label, plus a small "Prochaine" pill off the default. */
export default function RoundPicker({
  occurrences,
  value,
  onChange,
  defaultValue,
}: {
  occurrences: RoundOccurrence[];
  value: string;
  onChange: (productionDate: string) => void;
  defaultValue: string | null;
}) {
  const s = useKitchenT().stores;
  const lang = useKitchenLang();
  const sorted = [...occurrences].sort((a, b) => a.productionDate.localeCompare(b.productionDate));
  const idx = sorted.findIndex((o) => o.productionDate === value);
  const current = sorted[idx];
  const go = (i: number) => sorted[i] && onChange(sorted[i].productionDate);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 items-center gap-1 rounded-full border border-brand-line bg-card p-1">
        <Button variant="outline" size="icon" aria-label={s.prevRound} disabled={idx <= 0} onClick={() => go(idx - 1)}>
          <ChevronLeft />
        </Button>
        <span className="min-w-0 break-words px-2 text-center text-[15px] font-semibold text-brand-ink">
          {current ? formatRoundLabel(current, lang) : ""}
        </span>
        <Button variant="outline" size="icon" aria-label={s.nextRound} disabled={idx < 0 || idx >= sorted.length - 1} onClick={() => go(idx + 1)}>
          <ChevronRight />
        </Button>
      </div>
      {defaultValue && value !== defaultValue && (
        <Button variant="outline" className="h-8 px-3 text-[13px] cuisine:h-8 cuisine:px-3" onClick={() => onChange(defaultValue)}>{s.nextRoundReset}</Button>
      )}
    </div>
  );
}
