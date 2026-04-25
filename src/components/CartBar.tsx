import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, ChevronRight } from "lucide-react";

interface CartBarProps {
  itemCount: number;
  totalPrice: number;
  onCheckout: () => void;
}

export function CartBar({ itemCount, totalPrice, onCheckout }: CartBarProps) {
  return (
    <AnimatePresence>
      {itemCount > 0 && (
        <motion.div
          key="cart-bar"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="fixed inset-x-0 bottom-[72px] z-40 px-4"
        >
          <div className="max-w-lg mx-auto">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onCheckout}
              className="w-full flex items-center justify-between gap-3 bg-primary text-primary-foreground rounded-2xl px-5 py-3.5 shadow-xl shadow-primary/20"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <ShoppingCart className="w-5 h-5" />
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary-foreground text-primary text-[9px] font-bold flex items-center justify-center leading-none">
                    {Math.min(itemCount, 99)}
                  </span>
                </div>
                <span className="text-sm font-semibold">
                  {itemCount === 1 ? "1 item" : `${itemCount} items`}
                </span>
                <span className="text-primary-foreground/50">·</span>
                <span className="text-sm font-semibold tabular-nums">
                  €{totalPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-0.5 text-sm font-semibold">
                View Order
                <ChevronRight className="w-4 h-4" />
              </div>
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
