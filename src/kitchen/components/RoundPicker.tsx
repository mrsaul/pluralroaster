import { Button } from "@/components/ui/button";
import { useKitchenLang } from "@/kitchen/i18n";
import { useKitchenT } from "../i18n";
import { formatRoundLabel } from "../lib/rounds";
import type { RoundOccurrence } from "../types";

/** Previous / next round buttons around the round label, plus a "Prochaine" reset to the default. */
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
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" className="h-11" disabled={idx <= 0} onClick={() => go(idx - 1)}>{s.prevRound}</Button>
        <span className="text-center text-sm font-medium">{current ? formatRoundLabel(current, lang) : ""}</span>
        <Button variant="outline" className="h-11" disabled={idx < 0 || idx >= sorted.length - 1} onClick={() => go(idx + 1)}>{s.nextRound}</Button>
      </div>
      {defaultValue && value !== defaultValue && (
        <Button variant="ghost" className="mb-2 h-9" onClick={() => onChange(defaultValue)}>{s.nextRoundReset}</Button>
      )}
    </>
  );
}
