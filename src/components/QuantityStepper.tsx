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
}

export function QuantityStepper({ value, onChange, step = 0.5, min = 0, max = 999, className }: QuantityStepperProps) {
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(Math.min(max, value + step));

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
        {value > 0 ? `${value.toFixed(1)} kg` : "—"}
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
