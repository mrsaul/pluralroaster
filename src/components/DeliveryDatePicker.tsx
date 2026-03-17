import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { addDays, format, isWeekend, isBefore, startOfDay } from "date-fns";

interface DeliveryDatePickerProps {
  selected: string | null;
  onSelect: (date: string) => void;
}

function getDeliveryDates(): { date: Date; available: boolean }[] {
  const today = startOfDay(new Date());
  const dates: { date: Date; available: boolean }[] = [];
  for (let i = 2; i <= 16; i++) {
    const d = addDays(today, i);
    dates.push({ date: d, available: !isWeekend(d) });
  }
  return dates;
}

export function DeliveryDatePicker({ selected, onSelect }: DeliveryDatePickerProps) {
  const dates = getDeliveryDates();

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
      {dates.map(({ date, available }) => {
        const iso = format(date, "yyyy-MM-dd");
        const isSelected = selected === iso;
        return (
          <motion.button
            key={iso}
            whileTap={available ? { scale: 0.95 } : undefined}
            disabled={!available}
            onClick={() => onSelect(iso)}
            className={cn(
              "flex-shrink-0 w-14 h-16 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-colors duration-150",
              available && !isSelected && "border-border bg-card text-foreground hover:bg-muted",
              available && isSelected && "border-primary bg-primary text-primary-foreground",
              !available && "border-border bg-secondary text-muted-foreground opacity-30 line-through cursor-not-allowed"
            )}
          >
            <span className="text-[10px] uppercase font-medium tracking-wide">
              {format(date, "EEE")}
            </span>
            <span className="text-lg font-medium tabular-nums leading-none">
              {format(date, "d")}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
