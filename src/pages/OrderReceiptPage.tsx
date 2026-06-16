// src/pages/OrderReceiptPage.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import {
  type OrderReceiptData,
  formatDeliveryDate,
  inferGrind,
  GRIND_LABEL,
} from "@/lib/orderUtils";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const SESSION_KEY = "plural_order_receipt";

function itemLineHT(item: OrderReceiptData["items"][number]): number {
  if (item.unitPrice != null) return item.unitPrice * item.quantity;
  const qty = item.sizeKg != null ? item.sizeKg * item.quantity : item.quantity;
  return qty * item.pricePerKg;
}

function itemUnitHT(item: OrderReceiptData["items"][number]): number {
  if (item.unitPrice != null) return item.unitPrice;
  return item.sizeKg != null ? item.sizeKg * item.pricePerKg : item.pricePerKg;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatPlacedAt(iso: string): string {
  return format(parseISO(iso), "EEEE d MMMM yyyy", { locale: fr });
}

function formatSizeLabel(item: OrderReceiptData["items"][number]): string {
  if (item.sizeLabel && item.sizeLabel !== "Standard") {
    if (item.sizeLabel === "1000g") return "1 kg";
    if (item.sizeLabel === "250g") return "250 g";
    if (item.sizeLabel === "500g") return "500 g";
    return item.sizeLabel;
  }
  if (item.sizeKg != null) {
    if (item.sizeKg === 1) return "1 kg";
    if (item.sizeKg < 1) return `${item.sizeKg * 1000} g`;
    return `${item.sizeKg} kg`;
  }
  return "";
}

export default function OrderReceiptPage() {
  const [data, setData] = useState<OrderReceiptData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      setData(JSON.parse(raw) as OrderReceiptData);
    } catch {
      setMissing(true);
      return;
    }
    // Trigger print after fonts settle
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  if (missing) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center">
        <p className="text-sm text-[#9E9E93]">
          Commande introuvable. Veuillez revenir depuis l'application.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const ref = data.orderId.slice(0, 8).toUpperCase();
  const snapVAT = data.totalHT * data.vatRate;

  return (
    <>
      {/* ── Global print styles ─────────────────────────────────────────────── */}
      <style>{`
        @page { size: A4; margin: 15mm 18mm; }
        @media print {
          body { background: #FAF6F0 !important; }
          .no-print { display: none !important; }
          .page-card {
            box-shadow: none !important;
            width: 100% !important;
            margin: 0 !important;
          }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        body { background: #e5e5e3; margin: 0; font-family: system-ui, sans-serif; }
      `}</style>

      {/* ── Screen wrapper ───────────────────────────────────────────────────── */}
      <div
        style={{
          minHeight: "100vh",
          background: "#e5e5e3",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 16px",
          gap: 20,
        }}
      >
        {/* Re-print button (hidden in print) */}
        <div className="no-print" style={{ width: 660, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            style={{ background: "#C9A8E0", border: "none", fontWeight: 700, color: "#1A1A18" }}
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Enregistrer en PDF
          </Button>
        </div>

        {/* ── A4 page card ─────────────────────────────────────────────────── */}
        <div
          className="page-card"
          style={{
            width: 660,
            minHeight: 920,
            background: "#FAF6F0",
            boxShadow: "0 8px 40px rgba(0,0,0,.22)",
            padding: "52px 56px 80px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Corner arcs */}
          <div style={{
            position: "absolute", top: -70, right: -70, width: 200, height: 200,
            border: "28px solid #C9A8E0", borderRadius: "50%", opacity: 0.13,
          }} />
          <div style={{
            position: "absolute", bottom: -50, left: -50, width: 140, height: 140,
            border: "20px solid #F4A261", borderRadius: "50%", opacity: 0.13,
          }} />

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img
                src="/favicon.png"
                width={64}
                height={64}
                alt="Plural Café"
                style={{ borderRadius: "50%", flexShrink: 0 }}
              />
              <div>
                <span style={{ display: "block", fontSize: 16, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#1A1A18" }}>
                  Plural
                </span>
                <span style={{ fontSize: 9, color: "#9E9E93", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Coffee made by several humans
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "#6B6B63", lineHeight: 1.75 }}>
              <span style={{ display: "block", fontFamily: "'Courier New', monospace", fontSize: 15, fontWeight: 700, color: "#1A1A18", marginBottom: 2 }}>
                #{ref}
              </span>
              <span>Passée le {formatPlacedAt(data.placedAt)}</span>
            </div>
          </div>

          {/* ── 4-colour accent bar ───────────────────────────────────────── */}
          <div style={{
            height: 3,
            background: "linear-gradient(90deg, #C9A8E0 0%, #F4A261 40%, #A8D5A2 70%, #5B8DB8 100%)",
            borderRadius: 2,
            marginBottom: 20,
          }} />

          {/* ── Document title ────────────────────────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9E9E93", marginBottom: 4 }}>
              Document de confirmation
            </div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: "#1A1A18" }}>
              Confirmation de commande
            </div>
          </div>

          {/* ── Delivery strip ────────────────────────────────────────────── */}
          <div style={{
            display: "flex",
            border: "1px solid #e0d9d0",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 28,
          }}>
            <div style={{ flex: 1, padding: "11px 16px", background: "#F0EBE3", borderRight: data.notes ? "1px solid #e0d9d0" : "none" }}>
              <span style={{ display: "block", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9E9E93", marginBottom: 3 }}>
                Date de livraison souhaitée
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18" }}>
                {formatDeliveryDate(data.deliveryDate)}
              </span>
            </div>
            {data.notes && (
              <div style={{ flex: 1, padding: "11px 16px", background: "#F0EBE3" }}>
                <span style={{ display: "block", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9E9E93", marginBottom: 3 }}>
                  Notes
                </span>
                <span style={{ fontSize: 11, color: "#6B6B63" }}>{data.notes}</span>
              </div>
            )}
          </div>

          {/* ── Items table ───────────────────────────────────────────────── */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 20 }}>
            <thead>
              <tr>
                {(
                  [
                    { label: "Produit", w: "42%", align: "left" },
                    { label: "Conditionnement", w: "22%", align: "left" },
                    { label: "Qté", w: "10%", align: "right" },
                    { label: "Prix unit. HT", w: "13%", align: "right" },
                    { label: "Total HT", w: "13%", align: "right" },
                  ] as const
                ).map((col) => (
                  <th
                    key={col.label}
                    style={{
                      textAlign: col.align,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#FAF6F0",
                      background: "#1A1A18",
                      padding: "8px 10px",
                      width: col.w,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => {
                const isService = item.kind === 'service';
                const grind = isService ? null : inferGrind(item.name, null);
                const grindLabel = grind?.key ? (GRIND_LABEL[grind.key] ?? null) : null;
                const sizeStr = isService ? null : formatSizeLabel(item);
                const conditioning = isService
                  ? "—"
                  : [sizeStr || null, grindLabel].filter(Boolean).join(" · ");
                const rowBg = i % 2 === 1 ? "#F0EBE3" : undefined;
                return (
                  <tr key={i}>
                    <td style={{ padding: "9px 10px", color: "#1A1A18", verticalAlign: "middle", borderBottom: "1px solid #e8e3db", background: rowBg }}>
                      <span style={{ display: "block", fontWeight: 600, fontSize: 11 }}>{item.name}</span>
                      <span style={{ fontSize: 9, color: "#9E9E93", marginTop: 1 }}>
                        {isService ? "Livraison" : "Café de spécialité"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 10px", color: "#1A1A18", borderBottom: "1px solid #e8e3db", background: rowBg }}>
                      {conditioning}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "#1A1A18", borderBottom: "1px solid #e8e3db", background: rowBg }}>
                      {item.quantity}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "#1A1A18", borderBottom: "1px solid #e8e3db", background: rowBg }}>
                      {fmtEur(itemUnitHT(item))}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "#1A1A18", borderBottom: "1px solid #e8e3db", background: rowBg }}>
                      {fmtEur(itemLineHT(item))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Totals ────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
            <div style={{ width: 220, fontSize: 11 }}>
              {/* Sous-total HT (full catalog price before discount) */}
              {data.discountPercent != null && data.discountPercent > 0 ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}>
                    <span>Sous-total HT</span>
                    <span>{fmtEur(data.totalHT + (data.discountAmount ?? 0))}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#3a8a5a", borderBottom: "1px solid #e8e3db" }}>
                    <span>Remise {data.discountPercent} %</span>
                    <span>−{fmtEur(data.discountAmount ?? 0)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}>
                    <span>Base HT remisée</span>
                    <span>{fmtEur(data.totalHT)}</span>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}>
                  <span>Sous-total HT</span>
                  <span>{fmtEur(data.totalHT)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}>
                <span>TVA 20 %</span>
                <span>{fmtEur(snapVAT)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 5px", fontSize: 14, fontWeight: 700, color: "#1A1A18", borderTop: "2px solid #1A1A18", marginTop: 3 }}>
                <span>Total TTC</span>
                <span>{fmtEur(data.totalTTC)}</span>
              </div>
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div style={{
            position: "absolute",
            bottom: 32, left: 56, right: 56,
            borderTop: "1px solid #e0d9d0",
            paddingTop: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 10,
            color: "#9E9E93",
          }}>
            <span style={{ fontStyle: "italic", fontSize: 12, color: "#6B6B63" }}>
              Merci pour votre commande&nbsp;!
            </span>
            <div style={{ textAlign: "right", lineHeight: 1.6 }}>
              <span>contact@pluralcafe.fr</span><br />
              <span>pluralcafe.fr</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
