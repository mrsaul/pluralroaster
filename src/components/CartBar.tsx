import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart } from "lucide-react";

interface CartBarProps {
  totalKg: number;
  totalPrice: number;
  onCheckout: () => void;
}

export function CartBar({ totalKg, totalPrice, onCheckout }: CartBarProps) {
  return (
    <AnimatePresence>
      {totalKg > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-card border-t border-border shadow-subtle"
        >
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {totalKg.toFixed(1)} kg
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  €{totalPrice.toFixed(2)} est.
                </p>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onCheckout}
              className="px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-colors duration-150"
            >
              Review Order
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
