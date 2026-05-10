import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { fr } from "date-fns/locale/fr";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/store";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function frenchStatus(status: string): string {
  const map: Record<string, string> = {
    pending: "En attente",
    received: "Reçue",
    confirmed: "Confirmée",
    approved: "Approuvée",
    in_production: "En torréfaction",
    ready_for_packaging: "Prêt à conditionner",
    packaging: "Conditionnement",
    ready_for_delivery: "Prêt à livrer",
    shipped: "Expédiée",
    delivered: "Livrée",
    fulfilled: "Traitée",
    synced: "Synchronisée",
  };
  return map[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

export function statusColor(status: string): string {
  if (status === "received" || status === "pending") {
    return "bg-yellow-100 text-yellow-800";
  }
  if (status === "confirmed" || status === "approved") {
    return "bg-blue-100 text-blue-800";
  }
  if (
    status === "in_production" ||
    status === "packaging" ||
    status === "ready_for_packaging"
  ) {
    return "bg-orange-100 text-orange-800";
  }
  if (status === "ready_for_delivery" || status === "shipped") {
    return "bg-purple-100 text-purple-800";
  }
  if (
    status === "delivered" ||
    status === "fulfilled" ||
    status === "synced"
  ) {
    return "bg-green-100 text-green-800";
  }
  return "bg-gray-100 text-gray-700";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderHistoryTabProps {
  orders: Order[];
  loading?: boolean;
  onViewDetail: (order: Order) => void;
  onReorder: (order: Order) => void;
}

// ── Animation variants ────────────────────────────────────────────────────────

const listVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-5 w-20 rounded-full bg-muted" />
      </div>
      <div className="h-3 w-32 rounded bg-muted" />
      <div className="flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-8 w-8 rounded-full bg-muted" />
        ))}
      </div>
      <div className="flex justify-between items-center pt-1">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded bg-muted" />
          <div className="h-8 w-28 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order;
  onViewDetail: (order: Order) => void;
  onReorder: (order: Order) => void;
}

function OrderCard({ order, onViewDetail, onReorder }: OrderCardProps) {
  const ref = `#${order.id.slice(0, 8).toUpperCase()}`;
  const dateStr = format(new Date(order.createdAt), "d MMM yyyy", { locale: fr });
  const visibleItems = order.items.slice(0, 4);
  const extraCount = order.items.length - 4;

  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
    >
      {/* Top row: ref + status badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono text-xs text-muted-foreground">{ref}</span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(order.status)}`}
        >
          {frenchStatus(order.status)}
        </span>
      </div>

      {/* Date */}
      <p className="text-xs text-muted-foreground">{dateStr}</p>

      {/* Product thumbnails */}
      <div className="flex items-center">
        {visibleItems.map((item, i) => (
          <div
            key={i}
            className={`flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold uppercase border-2 border-card ${i !== 0 ? "-ml-2" : ""}`}
            style={{ width: 30, height: 30, flexShrink: 0 }}
            title={item.product.name}
          >
            {item.product.name.charAt(0)}
          </div>
        ))}
        {extraCount > 0 && (
          <div
            className="flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold border-2 border-card -ml-2"
            style={{ width: 30, height: 30, flexShrink: 0 }}
          >
            +{extraCount}
          </div>
        )}
      </div>

      {/* Footer: article count + price + actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            {order.items.length} article{order.items.length > 1 ? "s" : ""}
          </span>
          <span className="text-sm font-semibold">
            €{order.totalPrice.toFixed(2)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetail(order)}
          >
            Voir détails
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onReorder(order)}
          >
            Re-commander
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export function OrderHistoryTab({
  orders,
  loading = false,
  onViewDetail,
  onReorder,
}: OrderHistoryTabProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="p-4 rounded-full bg-muted">
          <Package className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            Aucune commande pour l&apos;instant
          </p>
          <p className="text-sm text-muted-foreground">
            Vos commandes apparaîtront ici une fois passées.
          </p>
        </div>
      </div>
    );
  }

  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  return (
    <div className="space-y-3">
      <AnimatePresence>
        <motion.div
          className="space-y-3"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          {visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onViewDetail={onViewDetail}
              onReorder={onReorder}
            />
          ))}
        </motion.div>
      </AnimatePresence>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Charger plus
          </Button>
        </div>
      )}
    </div>
  );
}
