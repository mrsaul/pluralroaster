import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Order } from "@/lib/store";
import { format, parseISO } from "date-fns";

interface OrderHistoryPageProps {
  orders: Order[];
  onBack: () => void;
}

export default function OrderHistoryPage({ orders, onBack }: OrderHistoryPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={onBack} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-base font-medium text-foreground">Order History</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
        >
          {orders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No orders yet.</p>
          )}
          {orders.map((order) => (
            <motion.div
              key={order.id}
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              className="bg-card border border-border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-foreground">{order.id}</span>
                <StatusBadge status={order.status} sellsyId={order.sellsyId} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {format(parseISO(order.createdAt), "MMM d, yyyy")}
                </span>
                <span className="tabular-nums text-foreground font-medium">
                  {order.totalKg.toFixed(1)} kg · €{order.totalPrice.toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {order.items.map((item) => (
                  <span key={item.product.id} className="inline-block mr-3">
                    {item.product.name} ({item.quantity}kg)
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
