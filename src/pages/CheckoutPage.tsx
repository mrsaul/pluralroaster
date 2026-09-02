import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, AlertCircle, Package, RotateCcw, Share2, FileText, Copy, Check } from "lucide-react";
import { DeliveryDatePicker } from "@/components/DeliveryDatePicker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CartItem, Product } from "@/lib/store";
import { cn } from "@/lib/utils";
import { type OrderReceiptData, buildPlainTextSummary, resolveVariantLabel } from "@/lib/orderUtils";
import { SwipeableCartRow } from "@/components/SwipeableCartRow";
import { useT } from "@/i18n";

interface CheckoutPageProps {
  items: CartItem[];
  totalKg: number;
  totalPrice: number;
  onBack: () => void;
  onConfirm: (deliveryDate: string, notes?: string) => Promise<{ orderId: string }>;
  /** Short ref of the original order when this is a re-order (e.g. "A1B2C3D4") */
  reorderedFromRef?: string | null;
  clientName?: string;
  /** Remove a specific line item from the draft order */
  onRemoveItem?: (product: Product, sizeLabel?: string) => void;
  /** Update quantity and/or variant of a specific line item */
  onUpdateItem?: (
    product: Product,
    oldSizeLabel: string | undefined,
    quantity: number,
    newSizeLabel?: string,
    newSizeKg?: number,
    newUnitPrice?: number,
  ) => void;
}

type Step = "review" | "success" | "error";

const VAT = 0.20;

// ── Helper: compute line totals ───────────────────────────────────────────────

function lineHT(item: CartItem): number {
  if (item.unitPrice != null && item.quantity != null) return item.unitPrice * item.quantity;
  const qty = item.sizeKg ? item.sizeKg * item.quantity : item.quantity;
  return qty * item.product.pricePerKg;
}

function lineQtyKg(item: CartItem): number {
  return item.sizeKg ? item.sizeKg * item.quantity : item.quantity;
}

function linePricePerKg(item: CartItem): number {
  if (item.unitPrice != null && item.sizeKg) return item.unitPrice / item.sizeKg;
  return item.product.pricePerKg;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckoutPage({
  items,
  totalKg,
  totalPrice,
  onBack,
  onConfirm,
  reorderedFromRef,
  clientName = '',
  onRemoveItem,
  onUpdateItem,
}: CheckoutPageProps) {
  const t = useT();
  const [step, setStep] = useState<Step>("review");
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Snapshot before cart clears — keeps success screen populated
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [confirmedItems, setConfirmedItems] = useState<CartItem[]>([]);
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const vatAmount = totalPrice * VAT;
  const totalTTC = totalPrice + vatAmount;

  const handleConfirm = useCallback(async () => {
    if (!deliveryDate || submitting) return;
    // Snapshot now — parent will clear cart after onConfirm resolves
    const snap = [...items];
    const snapTotal = totalPrice;

    setSubmitting(true);
    setOrderError(null);
    try {
      const { orderId } = await onConfirm(deliveryDate, notes.trim() || undefined);
      setConfirmedAt(new Date().toISOString());
      setConfirmedItems(snap);
      setConfirmedTotal(snapTotal);
      setConfirmedOrderId(orderId);
      // Write receipt data for PDF page (sessionStorage, main branch shape)
      const now = new Date().toISOString();
      const receiptData: OrderReceiptData = {
        orderId: orderId,
        placedAt: now,
        deliveryDate: deliveryDate,
        notes: notes.trim() || null,
        items: snap.map((item) => ({
          name: item.product.name,
          sizeLabel: item.sizeLabel ?? null,
          sizeKg: item.sizeKg ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? null,
          pricePerKg: item.product.pricePerKg,
          kind: 'coffee' as const,
        })),
        totalHT: snapTotal,
        vatRate: 0.20,
        totalTTC: snapTotal * 1.20,
      };
      sessionStorage.setItem("plural_order_receipt", JSON.stringify(receiptData));
      setStep("success");
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [deliveryDate, items, notes, onConfirm, submitting, totalPrice]);

  // ── Success screen ────────────────────────────────────────────────────────

  if (step === "success") {
    const snapHT  = confirmedTotal;
    const snapVAT = snapHT * VAT;
    const snapTTC = snapHT + snapVAT;

    const receiptData: OrderReceiptData = {
      orderId:      confirmedOrderId ?? "",
      placedAt:     confirmedAt ?? new Date().toISOString(),
      deliveryDate: deliveryDate ?? "",
      notes:        notes.trim() || null,
      items: confirmedItems.map(item => ({
        name:       item.product.name,
        sizeLabel:  item.sizeLabel ?? null,
        sizeKg:     item.sizeKg ?? null,
        quantity:   item.quantity,
        unitPrice:  item.unitPrice ?? null,
        pricePerKg: item.product.pricePerKg,
        kind:       'coffee' as const,
      })),
      totalHT:  snapHT,
      vatRate:  0.20,
      totalTTC: snapTTC,
    };

    const handleShare = async () => {
      const text = buildPlainTextSummary(receiptData);
      if (navigator.share) {
        try {
          await navigator.share({ title: "Commande Plural Café", text });
        } catch (err) {
          if (err instanceof Error && err.name !== "AbortError") {
            await navigator.clipboard.writeText(text).catch(() => {});
          }
        }
      } else {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    const handlePdf = () => {
      sessionStorage.setItem("plural_order_receipt", JSON.stringify(receiptData));
      window.open("/order-receipt", "_blank", "noopener");
    };

    const handleCopy = async () => {
      const text = buildPlainTextSummary(receiptData);
      await navigator.clipboard.writeText(text).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md space-y-6"
        >
          {/* Icon + message */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                {t.checkout.successTitle}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t.checkout.successSubtitle}
              </p>
            </div>
          </div>

          {/* Order reference */}
          {confirmedOrderId && (
            <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">{t.checkout.orderRef}</p>
              <p className="font-mono text-sm font-medium text-foreground mt-0.5">
                #{confirmedOrderId.slice(0, 8).toUpperCase()}
              </p>
            </div>
          )}

          {/* Order summary */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="divide-y divide-border">
              {confirmedItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between px-4 py-2.5 gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.sizeLabel
                        ? `${resolveVariantLabel({ size_label: item.sizeLabel, size_kg: item.sizeKg ?? null })} × ${item.quantity}`
                        : `${lineQtyKg(item).toFixed(2)} kg`}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums text-foreground shrink-0">
                    €{lineHT(item).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-border bg-muted/20 divide-y divide-border/50 text-sm">
              <div className="flex justify-between px-4 py-2 text-muted-foreground">
                <span>{t.checkout.subtotalHT}</span>
                <span className="tabular-nums">€{snapHT.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 text-muted-foreground">
                <span>{t.checkout.vat}</span>
                <span className="tabular-nums">€{snapVAT.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 font-semibold text-foreground">
                <span>{t.checkout.totalTTC}</span>
                <span className="tabular-nums">€{snapTTC.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ── Share actions ── */}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleShare()}>
              <Share2 className="w-4 h-4 mr-1.5" />
              {t.checkout.share}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePdf}>
              <FileText className="w-4 h-4 mr-1.5" />
              {t.checkout.pdf}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleCopy()} disabled={copied}>
              {copied
                ? <><Check className="w-4 h-4 mr-1.5" />{t.checkout.copied}</>
                : <><Copy className="w-4 h-4 mr-1.5" />{t.checkout.copy}</>}
            </Button>
          </div>

          <Button className="w-full" size="lg" onClick={onBack}>
            {t.checkout.placeNewOrder}
          </Button>
        </motion.div>
      </div>
    );
  }

  // ── Error screen ──────────────────────────────────────────────────────────

  if (step === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md space-y-6 text-center"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t.checkout.errorTitle}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {orderError ?? t.checkout.errorGeneric}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              onClick={() => { setStep("review"); setOrderError(null); }}
            >
              {t.checkout.tryAgain}
            </Button>
            <Button variant="outline" size="lg" onClick={onBack}>
              {t.checkout.backToCart}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Review screen ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 pt-[max(20px,calc(env(safe-area-inset-top)+16px))] pb-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            disabled={submitting}
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-base font-medium text-foreground">{t.checkout.reviewOrder}</h1>
            <p className="text-xs text-muted-foreground tabular-nums">
              {totalKg.toFixed(2)} kg · €{totalTTC.toFixed(2)} TTC
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-10">

        {/* ── Re-order banner ── */}
        {reorderedFromRef && (
          <div className="flex items-center gap-2.5 rounded-xl bg-primary/8 border border-primary/20 px-4 py-3 text-sm text-primary">
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>
              {t.checkout.basedOn}{" "}
              <span className="font-mono font-semibold">#{reorderedFromRef.slice(0, 8).toUpperCase()}</span>
            </span>
          </div>
        )}

        {/* ── Order items ── */}
        <section className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
            <Package className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">{t.checkout.orderItems}</h2>
          </div>

          <div className="divide-y divide-border">
            {items.map((item, i) => {
              const subtitle = item.sizeLabel
                ? `${resolveVariantLabel({ size_label: item.sizeLabel, size_kg: item.sizeKg ?? null })} × ${item.quantity}`
                : `${lineQtyKg(item).toFixed(2)} kg`;
              return (
                <SwipeableCartRow
                  key={`${item.product.id}::${item.sizeLabel ?? ""}::${i}`}
                  item={item}
                  lineTotal={lineHT(item)}
                  subtitle={subtitle}
                  onRemove={onRemoveItem
                    ? () => onRemoveItem(item.product, item.sizeLabel)
                    : () => {}}
                  onUpdate={onUpdateItem
                    ? (qty, newSizeLabel, newSizeKg, newUnitPrice) =>
                        onUpdateItem(item.product, item.sizeLabel, qty, newSizeLabel, newSizeKg, newUnitPrice)
                    : () => {}}
                />
              );
            })}
          </div>

          {/* Totals */}
          <div className="border-t border-border bg-muted/20 divide-y divide-border/50 text-sm">
            <div className="flex justify-between px-4 py-2">
              <span className="text-muted-foreground">{t.checkout.subtotalHT}</span>
              <span className="tabular-nums text-foreground">€{totalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-muted-foreground">{t.checkout.vat}</span>
              <span className="tabular-nums text-foreground">€{vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between px-4 py-2 font-semibold">
              <span className="text-foreground">{t.checkout.totalTTC}</span>
              <span className="tabular-nums text-foreground">€{totalTTC.toFixed(2)}</span>
            </div>
          </div>
        </section>

        {/* ── Delivery date ── */}
        <section className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-foreground">{t.checkout.deliveryDate}</h2>
          <DeliveryDatePicker selected={deliveryDate} onSelect={setDeliveryDate} />
        </section>

        {/* ── Notes ── */}
        <section className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            {t.checkout.notes}{" "}
            <span className="text-muted-foreground font-normal">{t.checkout.notesOptional}</span>
          </h2>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.checkout.notesPlaceholder}
            className="resize-none text-sm"
            rows={3}
          />
        </section>

        {/* ── Actions ── */}
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full min-h-[52px]"
            disabled={!deliveryDate || submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting ? t.checkout.sendingOrder : t.checkout.confirmOrder}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full min-h-[52px]"
            disabled={submitting}
            onClick={onBack}
          >
            {t.checkout.editOrder}
          </Button>
        </div>
      </main>
    </div>
  );
}
