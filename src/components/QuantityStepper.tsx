import { Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
  renderValue?: (value: number) => string;
}

export function QuantityStepper({ value, onChange, step = 3, min = 0, max = 999, className, renderValue, disabled }: QuantityStepperProps) {
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(Math.min(max, value + step));

  const label = renderValue
    ? renderValue(value)
    : value > 0
      ? `${Number.isInteger(value) ? value : value.toFixed(1)} kg`
      : "—";

  return (
    <div className={cn("flex items-center gap-1 rounded-full bg-muted p-1", className)}>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={decrement}
        disabled={disabled}
        className="w-9 h-9 rounded-full cuisine:h-10 cuisine:w-10 border border-border bg-secondary disabled:opacity-40 flex items-center justify-center text-foreground transition-colors duration-150 hover:bg-card"
        aria-label="Diminuer la quantité"
      >
        <Minus className="w-4 h-4" />
      </motion.button>
      <span className="w-16 text-center font-sans text-sm tabular-nums font-medium text-foreground">
        {label}
      </span>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={increment}
        disabled={disabled}
        className={cn(
          "w-9 h-9 rounded-full cuisine:h-10 cuisine:w-10 flex items-center justify-center transition-colors duration-150 disabled:opacity-40",
          value > 0
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-secondary text-foreground hover:bg-card"
        )}
        aria-label="Augmenter la quantité"
      >
        <Plus className="w-4 h-4" />
      </motion.button>
    </div>
  );
}
