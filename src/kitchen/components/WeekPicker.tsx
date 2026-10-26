import { addDays, format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { useKitchenT } from "../i18n";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Previous / next week buttons around the week label, plus a "this week" reset. */
export default function WeekPicker({
  weekStart,
  currentWeekStart,
  onChange,
}: {
  weekStart: string;
  currentWeekStart: string;
  onChange: (weekStart: string | null) => void;
}) {
  const s = useKitchenT().stores;
  const shift = (days: number) => onChange(iso(addDays(parseISO(weekStart), days)));
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" className="h-11" onClick={() => shift(-7)}>{s.prevWeek}</Button>
        <span className="text-sm font-medium">{s.weekOf(format(parseISO(weekStart), "dd/MM"))}</span>
        <Button variant="outline" className="h-11" onClick={() => shift(7)}>{s.nextWeek}</Button>
      </div>
      {weekStart !== currentWeekStart && (
        <Button variant="ghost" className="mb-2 h-9" onClick={() => onChange(null)}>{s.thisWeek}</Button>
      )}
    </>
  );
}
