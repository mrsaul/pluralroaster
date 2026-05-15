import { useMemo, useState, useEffect, useCallback } from "react";
import { useUrlState } from "@/hooks/useUrlState";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { format, parseISO } from "date-fns";
import {
  Package, CheckSquare, ChevronDown, ChevronRight,
  Layers, Clock3, Weight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_CLASS,
  getOrderPriority, PRIORITY_CLASS, PRIORITY_LABEL,
  type OrderStatus, type PriorityLevel,
} from "@/lib/orderStatuses";

export type PackagingItem = {
  product_name: string;
  product_sku: string | null;
  quantity: number;
  price_per_kg: number;
  size_label: string | null;
  size_kg: number | null;
};

export type PackagingOrder = {
  id: string;
  client_name: string | null;
  delivery_date: string;
  total_kg: number;
  status: OrderStatus;
  is_roasted: boolean;
  is_packed: boolean;
  is_labeled: boolean;
  items: PackagingItem[];
};

type ViewMode = "orders" | "grouped";

interface PackagingViewProps {
  orders: PackagingOrder[];
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  onChecklistChange: (orderId: string, field: "is_roasted" | "is_packed" | "is_labeled", value: boolean) => void;
}

export function PackagingView({ orders, onStatusChange, onChecklistChange }: PackagingViewProps) {
  // Persist view mode to URL so returning to the tab restores it
  const [viewModeRaw, setViewMode] = useUrlState("pv", "orders");
  const viewMode = (viewModeRaw === "grouped" ? "grouped" : "orders") as ViewMode;

  // Persist expanded order IDs to sessionStorage
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem("packaging-expanded");
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  // Sync expanded IDs to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem("packaging-expanded", JSON.stringify([...expandedIds]));
    } catch { /* ignore */ }
  }, [expandedIds]);

  useScrollRestoration("admin-packaging", orders.length > 0);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Filter to packaging-relevant statuses
  const packagingOrders = useMemo(() =>
    orders
      .filter((o) => o.status === "packaging")
      .sort((a, b) => {
        // Sort by priority (urgent first), then by delivery date
        const pa = getOrderPriority(a.delivery_date);
        const pb = getOrderPriority(b.delivery_date);
        const priorityOrder: Record<PriorityLevel, number> = { urgent: 0, normal: 1, low: 2 };
        if (priorityOrder[pa] !== priorityOrder[pb]) return priorityOrder[pa] - priorityOrder[pb];
        return new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime();
      }),
    [orders]
  );

  // Group by product + size for batch view
  const productGroups = useMemo(() => {
    type Group = {
      product_name: string;
      size_label: string | null;
      total_kg: number;
      orders: { orderId: string; client_name: string | null; quantity: number; size_label: string | null }[];
    };
    const map = new Map<string, Group>();
    for (const order of packagingOrders) {
      for (const item of order.items) {
        const key = `${item.product_name}||${item.size_label ?? ""}`;
        const existing = map.get(key) ?? { product_name: item.product_name, size_label: item.size_label, total_kg: 0, orders: [] };
        // total_kg = units × size_kg (if known), else treat quantity as kg
        const itemKg = item.size_kg != null ? item.quantity * item.size_kg : item.quantity;
        existing.total_kg += itemKg;
        existing.orders.push({ orderId: order.id, client_name: order.client_name, quantity: item.quantity, size_label: item.size_label });
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total_kg - a.total_kg);
  }, [packagingOrders]);

  // Stats
  const totalKgInPackaging = packagingOrders.reduce((s, o) => s + o.total_kg, 0);
  const urgentCount = packagingOrders.filter((o) => getOrderPriority(o.delivery_date) === "urgent").length;

  return (
    <section className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Orders to pack</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{packagingOrders.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Total kg</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{totalKgInPackaging.toFixed(0)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Urgent</p>
          <p className={cn("text-2xl font-medium tabular-nums", urgentCount > 0 ? "text-destructive" : "text-foreground")}>
            {urgentCount}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Products to batch</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{productGroups.length}</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <Button
          variant={viewMode === "orders" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("orders")}
          className={cn("gap-1.5", viewMode === "orders" && "bg-cyan-700 opacity-95")}
        >
          <CheckSquare className="w-4 h-4" /> Order view
        </Button>
        <Button
          variant={viewMode === "grouped" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("grouped")}
          className={cn("gap-1.5", viewMode === "grouped" && "bg-cyan-700 opacity-95")}
        >
          <Layers className="w-4 h-4" /> Product grouping
        </Button>
      </div>

      {packagingOrders.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No orders ready for packaging</p>
        </div>
      ) : viewMode === "orders" ? (
        /* ── Order List View ── */
        <div className="space-y-3">
          {packagingOrders.map((order) => {
            const priority = getOrderPriority(order.delivery_date);
            const isExpanded = expandedIds.has(order.id);

            return (
              <div
                key={order.id}
                className={cn(
                  "bg-card border rounded-lg overflow-hidden transition-colors",
                  priority === "urgent" && "border-destructive/30",
                  priority === "normal" && "border-warning/30",
                  priority === "low" && "border-border",
                )}
              >
                {/* Header */}
                <button
                  type="button"
                  onClick={() => toggleExpand(order.id)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm">{order.client_name ?? order.id.slice(0, 8)}</span>
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium", PRIORITY_CLASS[priority])}>
                        {PRIORITY_LABEL[priority]}
                      </span>
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium", ORDER_STATUS_CLASS[order.status])}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock3 className="w-3 h-3" />
                        {format(parseISO(order.delivery_date), "EEE d MMM")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Weight className="w-3 h-3" />
                        {order.total_kg.toFixed(0)} kg
                      </span>
                      <span>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  {/* Checklist indicators */}
                  <div className="flex items-center gap-1.5 mr-2">
                    <div className={cn("w-2 h-2 rounded-full", order.is_roasted ? "bg-success" : "bg-border")} title="Roasted" />
                    <div className={cn("w-2 h-2 rounded-full", order.is_packed ? "bg-success" : "bg-border")} title="Packed" />
                    <div className={cn("w-2 h-2 rounded-full", order.is_labeled ? "bg-success" : "bg-border")} title="Labeled" />
                  </div>

                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>

                {/* Expanded */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border">
                    {/* Items */}
                    <div className="mt-3 divide-y divide-border/60">
                      {order.items.map((item, idx) => {
                        const totalKg = item.size_kg != null
                          ? item.quantity * item.size_kg
                          : item.quantity;
                        const hasSize = item.size_label && item.size_label !== "Standard";
                        return (
                          <div key={idx} className="flex items-center gap-3 py-2 text-sm">
                            <span className="flex-1 text-foreground font-medium">{item.product_name}</span>
                            {hasSize && (
                              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                                {item.size_label}
                              </span>
                            )}
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {hasSize
                                ? `${item.quantity} × ${item.size_label}`
                                : `${totalKg.toFixed(totalKg % 1 === 0 ? 0 : 2)} kg`}
                            </span>
                            <span className="shrink-0 tabular-nums font-medium text-foreground w-16 text-right">
                              {totalKg.toFixed(totalKg % 1 === 0 ? 0 : 2)} kg
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Checklist */}
                    <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Checklist</p>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={order.is_roasted}
                          onCheckedChange={(v) => onChecklistChange(order.id, "is_roasted", Boolean(v))}
                        />
                        <span className={cn(order.is_roasted && "line-through text-muted-foreground")}>Roasted</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={order.is_packed}
                          onCheckedChange={(v) => onChecklistChange(order.id, "is_packed", Boolean(v))}
                        />
                        <span className={cn(order.is_packed && "line-through text-muted-foreground")}>Packed</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={order.is_labeled}
                          onCheckedChange={(v) => onChecklistChange(order.id, "is_labeled", Boolean(v))}
                        />
                        <span className={cn(order.is_labeled && "line-through text-muted-foreground")}>Labeled</span>
                      </label>
                    </div>

                    {/* Quick actions */}
                    <div className="flex gap-2">
                      {order.status === "packaging" && (
                        <Button size="sm" onClick={() => onStatusChange(order.id, "ready_for_delivery")} className="gap-1.5">
                          <CheckSquare className="w-3.5 h-3.5" /> Mark as Ready for Delivery
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Product Grouping View ── */
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Total kg</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead>Breakdown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productGroups.map((group, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-foreground">
                    <div>{group.product_name}</div>
                    {group.size_label && group.size_label !== "Standard" && (
                      <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {group.size_label}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground font-medium">
                    {group.total_kg.toFixed(group.total_kg % 1 === 0 ? 0 : 2)} kg
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{group.orders.length}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {group.orders.map((o, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px]">
                          {o.client_name ?? o.orderId.slice(0, 6)} · {o.quantity}{o.size_label && o.size_label !== "Standard" ? `×${o.size_label}` : "kg"}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
