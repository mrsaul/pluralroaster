import { motion } from "framer-motion";
import { RoastIcon } from "./RoastIcon";
import { QuantityStepper } from "./QuantityStepper";
import type { Product } from "@/lib/store";

interface ProductCardProps {
  product: Product;
  quantity: number;
  onQuantityChange: (product: Product, qty: number) => void;
}

export function ProductCard({ product, quantity, onQuantityChange }: ProductCardProps) {
  return (
    <motion.div
      layout
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg shadow-subtle"
    >
      <RoastIcon roastLevel={product.roastLevel} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate" style={{ textWrap: "balance" }}>
          {product.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {product.origin} · <span className="font-mono tabular-nums">{product.sku}</span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-medium tabular-nums text-foreground">
          €{product.pricePerKg.toFixed(2)}/kg
        </span>
        <QuantityStepper
          value={quantity}
          onChange={(qty) => onQuantityChange(product, qty)}
        />
      </div>
    </motion.div>
  );
}
