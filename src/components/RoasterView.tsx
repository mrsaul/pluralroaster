import { useMemo, useState } from "react";
import { format, parseISO, differenceInHours, isToday, isTomorrow, addDays, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Flame, ChevronDown, ChevronRight, Clock3, Package, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { type OrderStatus } from "@/lib/orderStatuses";
import { PercentChip } from "@/components/stock/PercentChip";
import { RoastedSheet } from "@/components/stock/RoastedSheet";
import { computeRoastingNeeds, isOpenForRoasting, type RoastingLine, type RoastingNeed } from "@/lib/roasting";
import { useRoastingInputs } from "@/hooks/useRoasting";

/* ─── Types ─── */

export interface RoasterOrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  kind: "coffee" | "service";
}

export interface RoasterOrder {
  id: string;
  client_name: string | null;
  delivery_date: string;
  total_kg: number;
  status: OrderStatus;
  is_roasted: boolean;
  is_packed: boolean;
  items: RoasterOrderItem[];
}

interface RoasterViewProps {
  orders: RoasterOrder[];
  /** Moves an approved order into packaging (never touches stock). */
  onMarkRoasted: (orderId: string, value: boolean) => void;
}

type DateFilter = "all" | "today" | "tomorrow" | "this_week";

interface OrderEntry {
  orderId: string;
  clientName: string;
  quantity: number;
  deliveryDate: string;
  status: OrderStatus;
}

/* ─── Helpers ─── */

function getPriority(deliveryDate: string): "urgent" | "normal" | "low" {
  const diff = differenceInHours(parseISO(deliveryDate), new Date());
  if (diff <= 48) return "urgent";
  if (diff <= 96) return "normal";
  return "low";
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
  normal: "bg-warning/10 text-warning border-warning/20",
  low: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_LABELS: Record<string, string> = { urgent: "Urgent", normal: "Normal", low: "Faible" };

/* ─── Component ─── */

export function RoasterView({ orders, onMarkRoasted }: RoasterViewProps) {
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sheetNeed, setSheetNeed] = useState<RoastingNeed | null>(null);
  const inputsQ = useRoastingInputs();
  const inputs = inputsQ.data;

  // Orders still to roast (received/approved/packaging, not packed), then the date filter
  const relevantOrders = useMemo(() => {
    let filtered = orders.filter((o) => isOpenForRoasting(o));

    if (dateFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter((o) => {
        const d = parseISO(o.delivery_date);
        if (dateFilter === "today") return isToday(d);
        if (dateFilter === "tomorrow") return isTomorrow(d);
        if (dateFilter === "this_week") {
          const weekEnd = endOfDay(addDays(startOfDay(now), 7));
          return d <= weekEnd;
        }
        return true;
      });
    }

    return filtered;
  }, [orders, dateFilter]);

  // Same arithmetic as the Stock "À torréfier" tab
  const productGroups = useMemo(() => {
    if (!inputs) return null;
    const lines: RoastingLine[] = [];
    const entries = new Map<string, OrderEntry[]>();
    for (const order of relevantOrders) {
      for (const item of order.items) {
        if (item.kind === "service") continue;
        lines.push({
          orderId: order.id,
          productId: item.product_id,
          productName: inputs.productNames?.[item.product_id] ?? item.product_name,
          quantityKg: item.quantity,
          kind: "coffee",
          deliveryDate: order.delivery_date,
        });
        const list = entries.get(item.product_id) ?? [];
        list.push({
          orderId: order.id,
          clientName: order.client_name || "Client inconnu",
          quantity: item.quantity,
          deliveryDate: order.delivery_date,
          status: order.status,
        });
        entries.set(item.product_id, list);
      }
    }
    const needs = computeRoastingNeeds(lines, inputs, { includeCovered: true });
    return needs
      .map((need) => ({ need, priority: getPriority(need.earliestDelivery), orders: entries.get(need.productId) ?? [] }))
      .sort((a, b) => {
        const pOrder = { urgent: 0, normal: 1, low: 2 };
        if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
        return a.need.earliestDelivery.localeCompare(b.need.earliestDelivery);
      });
  }, [relevantOrders, inputs]);

  if (inputsQ.error) {
    return (
      <p className="text-sm text-destructive">
        Impossible de calculer le torréfié : {(inputsQ.error as Error).message}
      </p>
    );
  }
  if (!productGroups) {
    return <p className="text-sm text-muted-foreground">Calcul en cours…</p>;
  }

  // Summary stats
  const totalToRoastKg = productGroups.reduce((s, g) => s + g.need.toRoastKg, 0);
  const totalGreenKg = productGroups.reduce((s, g) => s + g.need.greenKg, 0);
  const urgentCount = productGroups.filter((g) => g.priority === "urgent" && g.need.toRoastKg > 0).length;

  const formatDeliveryLabel = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (isToday(d)) return "Aujourd'hui";
      if (isTomorrow(d)) return "Demain";
      return format(d, "EEE d MMM", { locale: fr });
    } catch {
      return dateStr;
    }
  };

  const suggestBatches = (kg: number) => {
    if (kg <= 15) return null;
    const batchSize = kg <= 30 ? 15 : 20;
    const batches = Math.ceil(kg / batchSize);
    return `${batches} fournées d'env. ${(kg / batches).toFixed(0)} kg`;
  };

  const toggleExpand = (productId: string) => {
    setExpandedProduct((prev) => (prev === productId ? null : productId));
  };

  return (
    <section className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">À torréfier</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{totalToRoastKg.toFixed(2)} kg</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Vert à peser</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{totalGreenKg.toFixed(2)} kg</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Cafés urgents</p>
          <p className={cn("text-2xl font-medium tabular-nums", urgentCount > 0 ? "text-destructive" : "text-foreground")}>
            {urgentCount}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 items-center">
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Date de livraison" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les dates</SelectItem>
            <SelectItem value="today">Aujourd'hui</SelectItem>
            <SelectItem value="tomorrow">Demain</SelectItem>
            <SelectItem value="this_week">Cette semaine</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {productGroups.length} café{productGroups.length !== 1 ? "s" : ""} · {relevantOrders.length} commande{relevantOrders.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Product list */}
      {productGroups.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Flame className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucun café à torréfier pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {productGroups.map(({ need, priority, orders: groupOrders }) => {
            const isExpanded = expandedProduct === need.productId;
            const batchSuggestion = suggestBatches(need.toRoastKg);
            const approvedOrders = groupOrders.filter((o) => o.status === "approved");

            return (
              <div key={need.productId} className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Product row */}
                <div className="flex items-center gap-3 p-4">
                  <button
                    type="button"
                    className="flex-1 min-w-0 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(need.productId)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">{need.productName}</span>
                        <Badge variant="outline" className={cn("text-[10px]", PRIORITY_STYLES[priority])}>
                          {priority === "urgent" && <AlertCircle className="w-3 h-3 mr-0.5" />}
                          {PRIORITY_LABELS[priority]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" /> {groupOrders.length} commande{groupOrders.length !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock3 className="w-3 h-3" /> {formatDeliveryLabel(need.earliestDelivery)}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="text-right shrink-0 space-y-1">
                    {need.toRoastKg > 0 ? (
                      <>
                        <p className="text-lg font-semibold tabular-nums text-foreground">{need.toRoastKg.toFixed(2)} kg</p>
                        <p className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                          <PercentChip
                            scope="product"
                            productId={need.productId}
                            productName={need.productName}
                            percent={need.percent}
                            isCustom={need.percentIsCustom}
                          />
                          <span>Vert <span className="tabular-nums">{need.greenKg.toFixed(2)} kg</span></span>
                        </p>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          aria-label={`Torréfié ${need.productName}`}
                          onClick={() => setSheetNeed(need)}
                        >
                          Torréfié ✓
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-success flex items-center justify-end gap-1">
                        <Check className="w-3.5 h-3.5" /> Couvert par le stock
                      </p>
                    )}
                  </div>
                </div>

                {/* Expanded breakdown */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Batching insight */}
                    {batchSuggestion && need.toRoastKg > 0 && (
                      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
                        <Flame className="w-3 h-3 text-warning" />
                        <span>Suggestion : {batchSuggestion}</span>
                      </div>
                    )}

                    {/* Order breakdown */}
                    <div className="divide-y divide-border">
                      {groupOrders.map((o) => (
                        <div key={o.orderId} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{o.clientName}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span>{o.quantity} kg</span>
                              <span>·</span>
                              <span>{formatDeliveryLabel(o.deliveryDate)}</span>
                            </div>
                          </div>
                          {o.status === "approved" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMarkRoasted(o.orderId, true);
                              }}
                            >
                              <Flame className="w-3.5 h-3.5" /> Passer en conditionnement
                            </Button>
                          ) : o.status === "packaging" ? (
                            <Badge variant="secondary" className="shrink-0">En conditionnement</Badge>
                          ) : (
                            <Badge variant="outline" className="shrink-0">À valider</Badge>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Bulk footer */}
                    {approvedOrders.length > 0 && (
                      <div className="px-4 py-3 bg-muted/20 border-t border-border flex items-center justify-end">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="default" className="gap-1.5 h-7 text-xs">
                              <Flame className="w-3 h-3" /> Tout passer en conditionnement
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Tout passer en conditionnement ?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {approvedOrders.length} commande{approvedOrders.length !== 1 ? "s" : ""} de {need.productName} passeront en conditionnement. Le stock ne change pas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction onClick={() => {
                                approvedOrders.forEach((o) => onMarkRoasted(o.orderId, true));
                              }}>
                                Confirmer
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <RoastedSheet need={sheetNeed} onClose={() => setSheetNeed(null)} />
    </section>
  );
}
