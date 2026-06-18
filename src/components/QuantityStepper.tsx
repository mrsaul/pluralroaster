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
  renderValue?: (value: number) => string;
}

export function QuantityStepper({ value, onChange, step = 3, min = 0, max = 999, className, renderValue }: QuantityStepperProps) {
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(Math.min(max, value + step));

  const label = renderValue
    ? renderValue(value)
    : value > 0
      ? `${Number.isInteger(value) ? value : value.toFixed(1)} kg`
      : "—";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={decrement}
        className="w-9 h-9 rounded-lg border border-border bg-secondary flex items-center justify-center text-foreground transition-colors duration-150 hover:bg-muted"
        aria-label="Decrease quantity"
      >
        <Minus className="w-4 h-4" />
      </motion.button>
      <span className="w-16 text-center font-mono text-sm tabular-nums font-medium text-foreground">
        {label}
      </span>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={increment}
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150",
          value > 0
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-secondary text-foreground hover:bg-muted"
        )}
        aria-label="Increase quantity"
      >
        <Plus className="w-4 h-4" />
      </motion.button>
    </div>
  );
}
