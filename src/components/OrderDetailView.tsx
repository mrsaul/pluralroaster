import { format } from "date-fns";
import { fr } from "date-fns/locale/fr";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { frenchStatus, statusColor } from "@/components/OrderHistoryTab";
import type { Order } from "@/lib/store";
import { resolveVariantLabel } from "@/lib/orderUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderDetailViewProps {
  order: Order;
  onBack: () => void;
  onReorder: (order: Order) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderDetailView({ order, onBack, onReorder }: OrderDetailViewProps) {
  const ref = `#${order.id.slice(0, 8).toUpperCase()}`;

  const subtotal = order.items.reduce(
    (sum, item) =>
      sum + (item.unitPrice ?? item.product.pricePerKg) * item.quantity,
    0
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center rounded-md p-1 -ml-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">
              Commande {ref}
            </h1>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(order.status)}`}
          >
            {frenchStatus(order.status)}
          </span>
        </div>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-32">
        {/* Articles */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Articles</h2>
          <ul className="space-y-3 divide-y divide-border">
            {order.items.map((item, i) => {
              const linePrice =
                (item.unitPrice ?? item.product.pricePerKg) * item.quantity;
              return (
                <li
                  key={i}
                  className={`flex items-center gap-3 ${i !== 0 ? "pt-3" : ""}`}
                >
                  {/* Avatar */}
                  <div
                    className="flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm uppercase shrink-0"
                    style={{ width: 40, height: 40 }}
                  >
                    {item.product.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.product.origin}
                    </p>
                    {item.sizeLabel && (
                      <p className="text-xs text-muted-foreground">
                        {resolveVariantLabel({ size_label: item.sizeLabel, size_kg: item.sizeKg ?? null })}
                      </p>
                    )}
                  </div>

                  {/* Quantity + price */}
                  <div className="text-right shrink-0">
                    <p className="text-sm text-muted-foreground">
                      Qté&nbsp;: {item.quantity}
                    </p>
                    <p className="text-sm font-medium">
                      €{linePrice.toFixed(2)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Récapitulatif */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Récapitulatif</h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sous-total</span>
            <span>€{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Livraison</span>
            <span className="italic text-muted-foreground">Incluse</span>
          </div>
          <div className="flex justify-between text-sm border-t border-border pt-2 mt-1">
            <span className="font-semibold text-base">Total</span>
            <span className="font-bold text-base">€{order.totalPrice.toFixed(2)}</span>
          </div>
        </section>

        {/* Livraison */}
        {order.deliveryDate && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Livraison</h2>
            <p className="text-sm text-muted-foreground">
              Livraison prévue&nbsp;:{" "}
              <span className="text-foreground capitalize">
                {format(new Date(order.deliveryDate), "EEEE d MMMM yyyy", {
                  locale: fr,
                })}
              </span>
            </p>
          </section>
        )}

        {/* Notes */}
        {order.notes && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Notes</h2>
            <p className="text-sm text-muted-foreground italic">{order.notes}</p>
          </section>
        )}
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-4">
        <Button
          variant="default"
          className="w-full"
          onClick={() => onReorder(order)}
        >
          Re-commander cette commande
        </Button>
      </div>
    </div>
  );
}
