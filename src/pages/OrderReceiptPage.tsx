import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import {
  type OrderReceiptData,
  GRIND_LABEL,
  inferGrind,
  formatDeliveryDate,
} from "@/lib/orderUtils";

const RECEIPT_STORAGE_KEY = "pr_order_receipt_v1";

// ── Currency helper ───────────────────────────────────────────────────────────

function fmtEur(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrderReceiptPage() {
  const [data, setData] = useState<OrderReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECEIPT_STORAGE_KEY);
      if (!raw) {
        setError("Aucun reçu trouvé. Passez une commande pour voir votre reçu.");
        return;
      }
      const parsed: OrderReceiptData = JSON.parse(raw) as OrderReceiptData;
      setData(parsed);
    } catch {
      setError("Impossible de charger le reçu.");
    }
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground text-center">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4 print:py-0 print:px-0">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Plural Roaster</h1>
              <p className="text-xs text-muted-foreground">Torréfacteur de café de spécialité</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Commande</p>
            <p className="font-mono text-sm font-medium text-foreground">
              #{data.orderId.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatDeliveryDate(data.createdAt)}
            </p>
          </div>
        </div>

        {/* ── Client / delivery ── */}
        <div className="grid grid-cols-2 gap-6 border border-border rounded-lg p-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Client
            </p>
            <p className="text-sm font-medium text-foreground">{data.clientName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Livraison prévue
            </p>
            <p className="text-sm font-medium text-foreground">
              {formatDeliveryDate(data.deliveryDate)}
            </p>
          </div>
        </div>

        {/* ── Items table ── */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Article
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Conditionnement
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Qté
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  PU HT
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total HT
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((item, i) => {
                const grindKey = item.grind ?? inferGrind(item.name);
                const grindLabel = grindKey ? (GRIND_LABEL[grindKey] ?? grindKey) : null;
                const sizeStr = item.sizeLabel ?? (item.sizeKg ? `${item.sizeKg} kg` : null);

                const conditioning = item.kind === 'service'
                  ? '—'
                  : [sizeStr || null, grindLabel].filter(Boolean).join(' · ');

                const unitDisplay = item.unitPrice ?? item.pricePerKg;
                const lineHT = item.unitPrice != null
                  ? item.unitPrice * item.quantity
                  : (item.sizeKg ?? 1) * item.quantity * item.pricePerKg;

                return (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    {/* Name + subtitle */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.kind === 'service' ? 'Livraison' : 'Café de spécialité'}
                      </p>
                    </td>
                    {/* Conditioning */}
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {conditioning || '—'}
                    </td>
                    {/* Quantity */}
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {item.quantity}
                    </td>
                    {/* Unit price */}
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {fmtEur(unitDisplay)}
                    </td>
                    {/* Line total */}
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                      {fmtEur(lineHT)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Totals ── */}
          <div className="border-t border-border bg-muted/20 divide-y divide-border/50 text-sm">
            <div className="flex justify-between px-5 py-2 text-muted-foreground">
              <span>Sous-total HT</span>
              <span className="tabular-nums">{fmtEur(data.subtotalHT)}</span>
            </div>
            <div className="flex justify-between px-5 py-2 text-muted-foreground">
              <span>TVA ({(data.vatRate * 100).toFixed(0)} %)</span>
              <span className="tabular-nums">{fmtEur(data.vatAmount)}</span>
            </div>
            <div className="flex justify-between px-5 py-3 font-semibold text-foreground">
              <span>Total TTC</span>
              <span className="tabular-nums">{fmtEur(data.totalTTC)}</span>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        {data.notes && (
          <div className="border border-border rounded-lg p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Notes
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{data.notes}</p>
          </div>
        )}

        {/* ── Footer ── */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          Plural Roaster · Café de spécialité · pluralroaster.com
        </p>
      </div>
    </div>
  );
}
