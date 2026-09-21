import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { ChevronDown, Check } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/store";

// ── Status timeline ───────────────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { label: "Reçue",         statuses: ["received", "synced", "pending", "confirmed", "approved"] },
  { label: "Torréfaction",  statuses: ["in_production"] },
  { label: "Emballage",     statuses: ["ready_for_packaging", "packaging"] },
  { label: "En livraison",  statuses: ["ready_for_delivery", "shipped"] },
  { label: "Livrée",        statuses: ["delivered", "fulfilled"] },
];

function getStepIndex(status: string): number {
  for (let i = TIMELINE_STEPS.length - 1; i >= 0; i--) {
    if (TIMELINE_STEPS[i].statuses.includes(status)) return i;
  }
  return 0;
}

function OrderTimeline({ status }: { status: string }) {
  const current = getStepIndex(status);
  return (
    <div className="relative flex items-center justify-between mb-5">
      {/* connecting line */}
      <div className="absolute inset-x-0 top-[14px] h-px bg-border" />
      <div
        className="absolute top-[14px] h-px bg-primary transition-all duration-500"
        style={{ left: 0, width: `${(current / (TIMELINE_STEPS.length - 1)) * 100}%` }}
      />
      {TIMELINE_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={step.label} className="relative flex flex-col items-center gap-1.5 z-10">
            <div className={cn(
              "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors",
              done   ? "bg-primary border-primary" :
              active ? "bg-background border-primary" :
                       "bg-background border-border"
            )}>
              {done
                ? <Check className="w-3.5 h-3.5 text-primary-foreground" />
                : <div className={cn("w-2 h-2 rounded-full", active ? "bg-primary" : "bg-border")} />
              }
            </div>
            <span className={cn(
              "text-[10px] font-medium text-center leading-tight w-14",
              active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"
            )}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  onReorder?: (order: Order) => void;
}

export function OrderCard({ order, onReorder }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusLabel: Record<string, string> = {
    pending: "Pending",
    confirmed: "Preparing",
    fulfilled: "Delivered",
    synced: "Confirmed",
    received: "Received",
    approved: "Approved",
    in_production: "In Production",
    ready_for_packaging: "Ready for Packaging",
    packaging: "Packaging",
    ready_for_delivery: "Ready for Delivery",
    shipped: "Shipped",
    delivered: "Delivered",
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Collapsed summary — tap to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-semibold text-foreground">
            {format(parseISO(order.deliveryDate), "EEEE d MMMM")}
          </p>
          <p className="text-xs text-muted-foreground">
            {order.items.length} item{order.items.length !== 1 ? "s" : ""} · {order.totalKg.toFixed(0)} kg
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} sellsyId={order.sellsyId} />
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              {/* Status timeline */}
              <OrderTimeline status={order.status} />

              {/* Info card */}
              <div className="rounded-xl bg-secondary/50 p-3 space-y-1 text-sm">
                <p className="text-foreground">
                  <span className="text-muted-foreground">Status: </span>
                  {statusLabel[order.status] ?? order.status}
                </p>
                {order.sellsyId && (
                  <p className="text-foreground">
                    <span className="text-muted-foreground">Invoice: </span>
                    <span className="font-mono">{order.sellsyId}</span>
                  </p>
                )}
                <p className="text-foreground">
                  <span className="text-muted-foreground">Order date: </span>
                  {format(parseISO(order.createdAt), "dd/MM/yyyy")}
                </p>
                <p className="text-foreground">
                  <span className="text-muted-foreground">Delivery date: </span>
                  {format(parseISO(order.deliveryDate), "dd/MM/yyyy")}
                </p>
              </div>

              {/* Items table */}
              <div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b-2 border-foreground pb-2 text-sm font-semibold text-foreground">
                  <span>Product</span>
                  <span className="text-center">Units/Kgs</span>
                  <span className="text-right">Sub.Total</span>
                </div>
                <div className="divide-y divide-border">
                  {order.items.map((item) => (
                    <div
                      key={item.product.id}
                      className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-3 text-sm"
                    >
                      <span className="font-medium text-foreground">{item.product.name}</span>
                      <span className="text-center tabular-nums text-muted-foreground">
                        {item.quantity} KG
                      </span>
                      <span className="text-right tabular-nums text-foreground">
                        {(item.quantity * item.product.pricePerKg).toFixed(0)}€
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">{order.totalKg.toFixed(0)} kg total</span>
                <span className="font-semibold tabular-nums text-foreground">
                  €{order.totalPrice.toFixed(2)}
                </span>
              </div>

              {/* Reorder button */}
              <div className="flex justify-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReorder?.(order)}
                  className="rounded-full border-primary/40 text-primary hover:bg-primary/10"
                >
                  Order again
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
