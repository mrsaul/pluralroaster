import { motion } from "framer-motion";
import { ProductCard } from "@/components/ProductCard";
import { CartBar } from "@/components/CartBar";
import { MOCK_PRODUCTS, type Product } from "@/lib/store";
import { LogOut, ClipboardList } from "lucide-react";

interface CatalogPageProps {
  cart: {
    totalKg: number;
    totalPrice: number;
    getQuantity: (id: string) => number;
    updateQuantity: (product: Product, qty: number) => void;
  };
  onCheckout: () => void;
  onViewOrders: () => void;
  onLogout: () => void;
}

export default function CatalogPage({ cart, onCheckout, onViewOrders, onLogout }: CatalogPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-medium tracking-tight text-foreground">PluralRoaster</h1>
            <p className="text-xs text-muted-foreground">Catalog</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onViewOrders} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Order history">
              <ClipboardList className="w-5 h-5 text-muted-foreground" />
            </button>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Logout">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-28">
        <motion.div
          className="flex flex-col gap-2"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {MOCK_PRODUCTS.filter(p => p.available).map((product) => (
            <motion.div
              key={product.id}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.3 }}
            >
              <ProductCard
                product={product}
                quantity={cart.getQuantity(product.id)}
                onQuantityChange={cart.updateQuantity}
              />
            </motion.div>
          ))}
        </motion.div>
      </main>

      <CartBar totalKg={cart.totalKg} totalPrice={cart.totalPrice} onCheckout={onCheckout} />
    </div>
  );
}
