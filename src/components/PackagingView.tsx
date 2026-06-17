import { useMemo, useState, useEffect, useCallback } from "react";
import { useUrlState } from "@/hooks/useUrlState";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { format, parseISO, isToday, isTomorrow, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Package, CheckSquare, ChevronDown, ChevronRight, Layers,
  AlertTriangle, Coffee, Wind, Droplets, Circle,
  CheckCircle2, Clock, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getOrderPriority, type OrderStatus, type PriorityLevel,
} from "@/lib/orderStatuses";
import { inferGrind, normalizeSize } from "@/lib/orderUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PackagingItem = {
  id: string;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  price_per_kg: number;
  size_label: string | null;
  size_kg: number | null;
  grind_type: string | null;
  /** Resolved from product_variants (source=sellsy) by matching product_id + size_kg.
   *  null means no Sellsy declination is mapped for this product/size combination. */
  sellsy_declination_id: number | null;
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
  notes: string | null;
  items: PackagingItem[];
};

type ViewMode = "orders" | "reference";
type StatusFilter = "todo" | "all";
type DateFilter = "today2" | "week" | "all";
type PackagingState = "todo" | "in_progress" | "ready";

interface PackagingViewProps {
  orders: PackagingOrder[];
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  onChecklistChange: (orderId: string, field: "is_roasted" | "is_packed" | "is_labeled", value: boolean) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRIND_LABEL: Record<string, string> = {
  whole_bean: "Grain entier",
  espresso: "Espresso",
  filter: "Filtre",
  french_press: "Piston",
  custom: "Personnalisé",
};

const GRIND_ICON: Record<string, React.ReactNode> = {
  whole_bean: <Circle className="w-3 h-3" />,
  espresso: <Wind className="w-3 h-3" />,
  filter: <Droplets className="w-3 h-3" />,
  french_press: <Coffee className="w-3 h-3" />,
  custom: <Coffee className="w-3 h-3" />,
};


function getSizeChipClass(label: string | null, sizeKg: number | null): string {
  const kg = sizeKg ?? (label === "1000g" || label === "Standard" ? 1 : label === "250g" ? 0.25 : null);
  if (kg === 0.25) return "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300";
  if (kg === 1) return "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300";
  return "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300";
}

function getPackagingState(order: PackagingOrder, packedLineIds: Set<string>): PackagingState {
  if (order.status === "ready_for_delivery") return "ready";
  if (order.is_packed && order.is_labeled) return "ready";
  const anyDone = order.is_roasted || order.is_packed || order.is_labeled ||
    order.items.some(i => packedLineIds.has(i.id));
  return anyDone ? "in_progress" : "todo";
}

const STATE_LABEL: Record<PackagingState, string> = {
  todo: "À préparer",
  in_progress: "En cours",
  ready: "Prêt",
};

const STATE_CLASS: Record<PackagingState, string> = {
  todo: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300",
  in_progress: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300",
  ready: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300",
};

function formatDayLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return "Aujourd'hui";
  if (isTomorrow(date)) return "Demain";
  return format(date, "EEEE d MMMM", { locale: fr });
}

function formatDeliveryDate(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, "EEE d MMM", { locale: fr });
}

// ── SessionStorage for per-line packed state ──────────────────────────────────
const PACKED_KEY = "packaging-packed-lines";

function loadPackedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(PACKED_KEY);
    return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
  } catch { return new Set<string>(); }
}

function savePackedIds(ids: Set<string>): void {
  try { sessionStorage.setItem(PACKED_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

// ── LineRow ───────────────────────────────────────────────────────────────────

function LineRow({
  item,
  isPacked,
  onToggle,
}: {
  item: PackagingItem;
  isPacked: boolean;
  onToggle: (id: string) => void;
}) {
  const grind = inferGrind(item.product_name, item.grind_type);
  const sizeDisplay = normalizeSize(item.size_label, item.size_kg);
  const hasSize = !!sizeDisplay;
  // Warning fires only when a size is present but no Sellsy declination is mapped for
  // this product+size. Resolved via product_variants (source=sellsy) in AdminDashboard —
  // never from order_items.product_variant_id which is structurally never populated.
  const missingVariant = hasSize && item.sellsy_declination_id == null;
  const totalKg = item.quantity; // quantity is always stored in kg
  const bags = item.size_kg != null ? Math.round(item.quantity / item.size_kg) : null;

  return (
    <div className={cn(
      "flex items-start gap-3 py-3 border-b border-border/50 last:border-0",
      isPacked && "opacity-50",
    )}>
      {/* Checkbox — large touch target */}
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className="mt-0.5 flex-shrink-0 w-12 h-12 -m-2 flex items-center justify-center rounded-lg hover:bg-muted/40 transition-colors"
        aria-label={isPacked ? "Marquer comme non conditionné" : "Marquer comme conditionné"}
      >
        {isPacked
          ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          : <div className="w-6 h-6 rounded-full border-2 border-border" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Product name */}
        <p className={cn(
          "text-base font-semibold text-foreground leading-tight",
          isPacked && "line-through text-muted-foreground",
        )}>
          {item.product_name}
        </p>
        {item.product_sku && (
          <p className="text-xs text-muted-foreground mt-0.5">SKU {item.product_sku}</p>
        )}

        {/* Chips row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {hasSize && (
            <span className={cn(
              "inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold",
              getSizeChipClass(item.size_label, item.size_kg),
            )}>
              {sizeDisplay}
            </span>
          )}
          {grind.key && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
              "bg-muted/50 border-border text-muted-foreground",
              grind.inferred && "border-dashed",
            )}>
              {GRIND_ICON[grind.key]}
              {GRIND_LABEL[grind.key]}
              {grind.inferred && <span className="opacity-60 text-[10px] ml-0.5">≈</span>}
            </span>
          )}
          {missingVariant && (
            <span className="inline-flex items-center gap-1 rounded border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              Variante Sellsy non liée
            </span>
          )}
        </div>
      </div>

      {/* Quantity + weight */}
      <div className="text-right flex-shrink-0">
        <p className="text-base font-semibold tabular-nums text-foreground">
          {bags != null ? `${bags} × ${sizeDisplay}` : `× ${item.quantity}`}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground mt-0.5">
          {Number.isInteger(totalKg) ? totalKg : totalKg.toFixed(2)} kg
        </p>
      </div>
    </div>
  );
}

// ── OrderCard ─────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  packedLineIds,
  onToggleLine,
  onChecklistChange,
  onStatusChange,
  defaultExpanded,
}: {
  order: PackagingOrder;
  packedLineIds: Set<string>;
  onToggleLine: (itemId: string) => void;
  onChecklistChange: (orderId: string, field: "is_roasted" | "is_packed" | "is_labeled", value: boolean) => void;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const state = getPackagingState(order, packedLineIds);
  const priority = getOrderPriority(order.delivery_date);
  const allLinesPacked = order.items.length > 0 && order.items.every(i => packedLineIds.has(i.id));
  const canMarkReady = allLinesPacked;

  // When all lines are packed, silently write all three étapes to true
  useEffect(() => {
    if (allLinesPacked && (!order.is_roasted || !order.is_packed || !order.is_labeled)) {
      if (!order.is_roasted) onChecklistChange(order.id, "is_roasted", true);
      if (!order.is_packed) onChecklistChange(order.id, "is_packed", true);
      if (!order.is_labeled) onChecklistChange(order.id, "is_labeled", true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLinesPacked]);

  const borderClass = cn(
    "bg-card border rounded-xl overflow-hidden transition-all",
    state === "ready" && "border-emerald-200 dark:border-emerald-800 opacity-75",
    state === "in_progress" && "border-blue-200 dark:border-blue-800",
    state === "todo" && priority === "urgent" && "border-destructive/40",
    state === "todo" && priority !== "urgent" && "border-border",
  );

  return (
    <div className={borderClass}>
      {/* ── Card header — always visible ── */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Priority + state badges */}
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {priority === "urgent" && state !== "ready" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  URGENT
                </span>
              )}
              <span className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                STATE_CLASS[state],
              )}>
                {state === "ready" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                {state === "in_progress" && <RotateCcw className="w-3 h-3 mr-1" />}
                {STATE_LABEL[state]}
              </span>
            </div>

            {/* Client name — large primary label */}
            <h3 className="text-xl font-bold text-foreground leading-tight truncate">
              {order.client_name ?? <span className="italic text-muted-foreground">Client sans nom</span>}
            </h3>

            {/* Order ref — small secondary */}
            <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>

            {/* Date + summary */}
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDeliveryDate(order.delivery_date)}
              </span>
              <span className="text-border">·</span>
              <span>{order.items.length} ligne{order.items.length !== 1 ? "s" : ""} · {order.total_kg.toFixed(order.total_kg % 1 === 0 ? 0 : 2)} kg</span>
            </div>
          </div>

          {/* Expand toggle */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 rounded-lg hover:bg-muted/40 transition-colors"
              aria-label={expanded ? "Réduire" : "Développer"}
            >
              {expanded
                ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {/* Primary action button — visible in header when collapsed */}
        {!expanded && state !== "ready" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded(true)}
            className="mt-3 w-full gap-2 h-10 text-sm font-medium"
          >
            <ChevronDown className="w-4 h-4" />
            {state === "todo" ? "Commencer la préparation" : "Reprendre la préparation"}
          </Button>
        )}
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-border">
          {/* Line items */}
          <div className="px-4 pt-2 pb-1">
            {order.items.map(item => (
              <LineRow
                key={item.id}
                item={item}
                isPacked={packedLineIds.has(item.id)}
                onToggle={onToggleLine}
              />
            ))}
          </div>


          {/* Notes */}
          {order.notes && (
            <div className="mx-4 mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 dark:bg-amber-950 dark:border-amber-800">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Note</p>
              <p className="text-sm text-amber-800 dark:text-amber-300">{order.notes}</p>
            </div>
          )}

          {/* Primary action */}
          <div className="px-4 pb-4">
            {order.status === "packaging" && (
              <Button
                size="lg"
                onClick={() => onStatusChange(order.id, "ready_for_delivery")}
                disabled={!canMarkReady}
                className={cn(
                  "w-full gap-2 h-12 text-base font-semibold",
                  canMarkReady && "bg-emerald-600 hover:bg-emerald-700 text-white",
                )}
                title={!canMarkReady ? "Cochez toutes les lignes pour marquer comme prêt" : undefined}
              >
                <CheckSquare className="w-5 h-5" />
                Marquer comme prêt pour livraison
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DaySection ────────────────────────────────────────────────────────────────

function DaySection({
  dateStr,
  orders,
  packedLineIds,
  onToggleLine,
  onChecklistChange,
  onStatusChange,
}: {
  dateStr: string;
  orders: PackagingOrder[];
  packedLineIds: Set<string>;
  onToggleLine: (itemId: string) => void;
  onChecklistChange: (orderId: string, field: "is_roasted" | "is_packed" | "is_labeled", value: boolean) => void;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const activeOrders = orders.filter(o => getPackagingState(o, packedLineIds) !== "ready");
  const doneOrders = orders.filter(o => getPackagingState(o, packedLineIds) === "ready");
  const totalKg = orders.reduce((s, o) => s + o.total_kg, 0);

  return (
    <div className="space-y-3">
      {/* Day header */}
      <div className="flex items-center gap-3 pt-2">
        <h2 className="text-sm font-semibold text-foreground capitalize">
          {formatDayLabel(dateStr)}
        </h2>
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {orders.length} commande{orders.length !== 1 ? "s" : ""} · {totalKg.toFixed(totalKg % 1 === 0 ? 0 : 1)} kg
        </span>
      </div>

      {/* Active orders */}
      {activeOrders.map(order => (
        <OrderCard
          key={order.id}
          order={order}
          packedLineIds={packedLineIds}
          onToggleLine={onToggleLine}
          onChecklistChange={onChecklistChange}
          onStatusChange={onStatusChange}
          defaultExpanded={activeOrders.length === 1}
        />
      ))}

      {/* Done orders — collapsed summary */}
      {doneOrders.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDone(v => !v)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            {showDone ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            {doneOrders.length} commande{doneOrders.length !== 1 ? "s" : ""} prête{doneOrders.length !== 1 ? "s" : ""}
          </button>
          {showDone && doneOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              packedLineIds={packedLineIds}
              onToggleLine={onToggleLine}
              onChecklistChange={onChecklistChange}
              onStatusChange={onStatusChange}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── BatchView (Par référence) ─────────────────────────────────────────────────

function BatchView({ orders, packedLineIds, onToggleLine }: {
  orders: PackagingOrder[];
  packedLineIds: Set<string>;
  onToggleLine: (itemId: string) => void;
}) {
  type BatchGroup = {
    key: string;
    product_name: string;
    size_label: string | null;
    size_kg: number | null;
    grind_type: string | null;
    total_bags: number;
    total_kg: number;
    lines: { orderId: string; client_name: string | null; item: PackagingItem }[];
  };

  const groups = useMemo(() => {
    const map = new Map<string, BatchGroup>();
    for (const order of orders) {
      for (const item of order.items) {
        const grind = inferGrind(item.product_name, item.grind_type);
        const key = `${item.product_name}||${item.size_label ?? ""}||${grind.key ?? ""}`;
        const existing = map.get(key) ?? {
          key,
          product_name: item.product_name,
          size_label: item.size_label,
          size_kg: item.size_kg,
          grind_type: grind.key,
          total_bags: 0,
          total_kg: 0,
          lines: [],
        };
        const itemBags = item.size_kg != null ? Math.round(item.quantity / item.size_kg) : item.quantity;
        existing.total_bags += itemBags;
        existing.total_kg = Math.round((existing.total_kg + item.quantity) * 10000) / 10000;
        existing.lines.push({ orderId: order.id, client_name: order.client_name, item });
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total_kg - a.total_kg);
  }, [orders]);

  return (
    <div className="space-y-4">
      {groups.map(group => {
        const sizeDisplay = normalizeSize(group.size_label, group.size_kg);
        const grindLabel = group.grind_type ? GRIND_LABEL[group.grind_type] : null;
        const allDone = group.lines.every(l => packedLineIds.has(l.item.id));
        return (
          <div key={group.key} className={cn(
            "bg-card border border-border rounded-xl overflow-hidden",
            allDone && "opacity-60",
          )}>
            <div className="p-4 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className={cn("text-base font-bold text-foreground", allDone && "line-through text-muted-foreground")}>
                    {group.product_name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {sizeDisplay && (
                      <span className={cn(
                        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold",
                        getSizeChipClass(group.size_label, group.size_kg),
                      )}>
                        {sizeDisplay}
                      </span>
                    )}
                    {grindLabel && (
                      <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {group.grind_type && GRIND_ICON[group.grind_type]}
                        {grindLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {sizeDisplay ? `${Math.round(group.total_bags)} × ${sizeDisplay}` : `${Math.round(group.total_bags)} sacs`}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">{group.total_kg.toFixed(group.total_kg % 1 === 0 ? 0 : 2)} kg</p>
                </div>
              </div>
            </div>
            <div className="border-t border-border divide-y divide-border/50">
              {group.lines.map(({ orderId, client_name, item }) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onToggleLine(item.id)}
                    className="flex-shrink-0 w-10 h-10 -m-1 flex items-center justify-center rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    {packedLineIds.has(item.id)
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      : <div className="w-5 h-5 rounded-full border-2 border-border" />}
                  </button>
                  <span className={cn(
                    "flex-1 text-sm font-medium text-foreground",
                    packedLineIds.has(item.id) && "line-through text-muted-foreground",
                  )}>
                    {client_name ?? orderId.slice(0, 8)}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {item.size_kg != null
                      ? `${Math.round(item.quantity / item.size_kg)} × ${normalizeSize(item.size_label, item.size_kg)}`
                      : `${item.quantity} kg`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main PackagingView ────────────────────────────────────────────────────────

export function PackagingView({ orders, onStatusChange, onChecklistChange }: PackagingViewProps) {
  const [viewModeRaw, setViewMode] = useUrlState("pv", "orders");
  const viewMode = (viewModeRaw === "reference" ? "reference" : "orders") as ViewMode;

  const [statusFilterRaw, setStatusFilter] = useUrlState("ps", "todo");
  const statusFilter = (statusFilterRaw === "all" ? "all" : "todo") as StatusFilter;

  const [dateFilterRaw, setDateFilter] = useUrlState("pd", "today2");
  const dateFilter = (["today2", "week", "all"].includes(dateFilterRaw) ? dateFilterRaw : "today2") as DateFilter;

  // Per-line local packed state — sessionStorage, survives tab switches
  const [packedLineIds, setPackedLineIds] = useState<Set<string>>(loadPackedIds);

  useEffect(() => { savePackedIds(packedLineIds); }, [packedLineIds]);

  const toggleLine = useCallback((itemId: string) => {
    setPackedLineIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  }, []);

  useScrollRestoration("admin-packaging", orders.length > 0);

  // Filter orders to packaging status
  const packagingOrders = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);

    return orders
      .filter(o => {
        if (o.status !== "packaging" && o.status !== "ready_for_delivery") return false;

        // Date filter
        const delivery = startOfDay(parseISO(o.delivery_date));
        const diffDays = Math.round((delivery.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        if (dateFilter === "today2" && diffDays > 2) return false;
        if (dateFilter === "week" && diffDays > 7) return false;

        // Status filter
        if (statusFilter === "todo") {
          const state = getPackagingState(o, packedLineIds);
          return state !== "ready";
        }
        return true;
      })
      .sort((a, b) => {
        const da = new Date(a.delivery_date).getTime();
        const db = new Date(b.delivery_date).getTime();
        if (da !== db) return da - db;
        return (a.client_name ?? "").localeCompare(b.client_name ?? "", "fr");
      });
  }, [orders, dateFilter, statusFilter, packedLineIds]);

  // Group by date
  const dayGroups = useMemo(() => {
    const map = new Map<string, PackagingOrder[]>();
    for (const o of packagingOrders) {
      const key = o.delivery_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [packagingOrders]);

  // Stats
  const totalKg = packagingOrders.reduce((s, o) => s + o.total_kg, 0);
  const urgentCount = packagingOrders.filter(o =>
    getOrderPriority(o.delivery_date) === "urgent" && getPackagingState(o, packedLineIds) !== "ready"
  ).length;
  const readyCount = packagingOrders.filter(o => getPackagingState(o, packedLineIds) === "ready").length;

  return (
    <section className="space-y-5 animate-in fade-in-0 duration-200">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1.5">À préparer</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {packagingOrders.length - readyCount}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1.5">Total kg</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {totalKg.toFixed(totalKg % 1 === 0 ? 0 : 1)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1.5">Urgent</p>
          <p className={cn("text-2xl font-bold tabular-nums", urgentCount > 0 ? "text-destructive" : "text-foreground")}>
            {urgentCount}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1.5">Prêtes</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{readyCount}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Date filter */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(["today2", "week", "all"] as DateFilter[]).map(v => {
            const labels = { today2: "Auj. + 2j", week: "Semaine", all: "Tout" };
            return (
              <button
                key={v}
                type="button"
                onClick={() => setDateFilter(v)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  dateFilter === v
                    ? "bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:bg-muted/50",
                  v !== "today2" && "border-l border-border",
                )}
              >
                {labels[v]}
              </button>
            );
          })}
        </div>

        {/* Status filter */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(["todo", "all"] as StatusFilter[]).map(v => {
            const labels = { todo: "À préparer", all: "Tous" };
            return (
              <button
                key={v}
                type="button"
                onClick={() => setStatusFilter(v)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  statusFilter === v
                    ? "bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:bg-muted/50",
                  v !== "todo" && "border-l border-border",
                )}
              >
                {labels[v]}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setViewMode("orders")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors",
              viewMode === "orders"
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:bg-muted/50",
            )}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Par commande
          </button>
          <button
            type="button"
            onClick={() => setViewMode("reference")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors border-l border-border",
              viewMode === "reference"
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:bg-muted/50",
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Par référence
          </button>
        </div>
      </div>

      {/* Content */}
      {packagingOrders.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Package className="w-10 h-10 mx-auto mb-4 opacity-30" />
          <p className="text-base font-medium text-foreground mb-1">Aucune commande à préparer</p>
          <p className="text-sm text-muted-foreground">
            {statusFilter === "todo" && dateFilter === "today2"
              ? "Toutes les commandes des prochains jours sont prêtes ou aucune n'est en attente."
              : "Modifiez les filtres pour voir d'autres commandes."}
          </p>
          {statusFilter === "todo" && (
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Voir toutes les commandes →
            </button>
          )}
        </div>
      ) : viewMode === "orders" ? (
        <div className="space-y-6">
          {dayGroups.map(([dateStr, dayOrders]) => (
            <DaySection
              key={dateStr}
              dateStr={dateStr}
              orders={dayOrders}
              packedLineIds={packedLineIds}
              onToggleLine={toggleLine}
              onChecklistChange={onChecklistChange}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      ) : (
        <BatchView
          orders={packagingOrders}
          packedLineIds={packedLineIds}
          onToggleLine={toggleLine}
        />
      )}
    </section>
  );
}
