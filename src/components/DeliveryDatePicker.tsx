import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface DeliveryDatePickerProps {
  selected: string | null;
  onSelect: (date: string) => void;
  /** Called once with the default date (if set by admin) so parent can pre-select it. */
  onDefaultDate?: (date: string) => void;
}

type AvailableDate = {
  date: string;
  is_default: boolean;
};

export function DeliveryDatePicker({ selected, onSelect, onDefaultDate }: DeliveryDatePickerProps) {
  const [dates, setDates] = useState<AvailableDate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDates() {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("delivery_dates")
        .select("date, is_default")
        .gte("date", today)
        .order("date", { ascending: true });

      if (!error && data && data.length > 0) {
        setDates(data);
        const defaultDate = data.find((d) => d.is_default);
        if (defaultDate && onDefaultDate) {
          onDefaultDate(defaultDate.date);
        }
      }
      setLoading(false);
    }
    void fetchDates();
  }, []);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-14 w-14 flex-shrink-0 rounded-xl border border-border bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No delivery dates are available yet. Check back soon.
      </p>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      {dates.map(({ date, is_default }) => {
        const parsed = parseISO(date);
        const isSelected = selected === date;
        return (
          <motion.button
            key={date}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(date)}
            className={cn(
              "flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-foreground transition-colors duration-150",
              !isSelected && "border-border bg-card hover:bg-muted",
              isSelected && "border-primary bg-primary text-primary-foreground",
            )}
          >
            <span className="text-[9px] font-medium uppercase tracking-[0.18em]">
              {format(parsed, "EEE")}
            </span>
            <span className="text-base font-semibold tabular-nums leading-none">
              {format(parsed, "d")}
            </span>
            {is_default && !isSelected && (
              <span className="text-[7px] font-medium uppercase tracking-wider text-primary leading-none mt-0.5">
                default
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
