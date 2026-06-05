import { useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Trash2, Plus, Minus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CartItem, ProductVariant } from "@/lib/store";
import { resolveVariantLabel } from "@/lib/orderUtils";

// ── Constants ─────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 60;   // px — distance to trigger snap
const ACTION_WIDTH    = 76;   // px — revealed action button width

// ── Props ─────────────────────────────────────────────────────────────────────

interface SwipeableCartRowProps {
  item: CartItem;
  /** Line total HT */
  lineTotal: number;
  /** Formatted "size × qty" or "X.XX kg" subtitle */
  subtitle: string;
  onRemove: () => void;
  /** newSizeLabel === undefined means no-variant product (quantity-only change) */
  onUpdate: (
    quantity: number,
    newSizeLabel?: string,
    newSizeKg?: number,
    newUnitPrice?: number,
  ) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SwipeableCartRow({
  item,
  lineTotal,
  subtitle,
  onRemove,
  onUpdate,
}: SwipeableCartRowProps) {
  // ── Swipe state ────────────────────────────────────────────────────────────
  const touchStart  = useRef<{ x: number; y: number } | null>(null);
  const isDragging  = useRef(false);
  const [offsetX, setOffsetX] = useState(0);
  const [snapped, setSnapped]  = useState<"none" | "edit" | "remove">("none");

  const resetSwipe = useCallback(() => {
    setOffsetX(0);
    setSnapped("none");
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isDragging.current  = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;

    // If predominantly vertical, let the page scroll
    if (!isDragging.current && Math.abs(dy) > Math.abs(dx)) return;
    isDragging.current = true;

    // Clamp to ±ACTION_WIDTH
    const clamped = Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, dx));
    setOffsetX(clamped);
    // Prevent page scroll while swiping horizontally
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    if (offsetX < -SWIPE_THRESHOLD) {
      setOffsetX(-ACTION_WIDTH);
      setSnapped("remove");
    } else if (offsetX > SWIPE_THRESHOLD) {
      setOffsetX(ACTION_WIDTH);
      setSnapped("edit");
    } else {
      resetSwipe();
    }
    touchStart.current = null;
  };

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);

  const variants: ProductVariant[] | undefined = item.product.variants;
  const initialVariant = variants?.find(
    (v) => v.size_label === item.sizeLabel,
  ) ?? variants?.[0];

  const [editQty,     setEditQty]     = useState(item.quantity);
  const [editVariant, setEditVariant] = useState<ProductVariant | undefined>(initialVariant);

  const openEdit = () => {
    setEditQty(item.quantity);
    setEditVariant(initialVariant);
    resetSwipe();
    setEditOpen(true);
  };

  const cancelEdit = () => setEditOpen(false);

  const saveEdit = () => {
    if (editQty <= 0) { onRemove(); return; }
    onUpdate(editQty, editVariant?.size_label, editVariant?.size_kg, editVariant?.price);
    setEditOpen(false);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const hasVariants   = variants && variants.length > 1;
  const isSnappedEdit = snapped === "edit";
  const isSnappedRemove = snapped === "remove";

  // transition: no transition while finger is down (feels laggy), snap with easing on release
  const rowTransition = isDragging.current ? "none" : "transform 200ms ease";

  return (
    <div className="relative overflow-hidden bg-card">
      {/* ── Edit action (left, revealed by swipe-right) ── */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 flex flex-col items-center justify-center gap-0.5",
          "w-[76px] bg-orange-500 cursor-pointer select-none",
        )}
        onClick={isSnappedEdit ? openEdit : undefined}
      >
        <Pencil className="w-5 h-5 text-white" />
        <span className="text-[11px] font-semibold text-white">Edit</span>
      </div>

      {/* ── Remove action (right, revealed by swipe-left) ── */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-0.5",
          "w-[76px] bg-red-500 cursor-pointer select-none",
        )}
        onClick={isSnappedRemove ? onRemove : undefined}
      >
        <Trash2 className="w-5 h-5 text-white" />
        <span className="text-[11px] font-semibold text-white">Remove</span>
      </div>

      {/* ── Foreground row ── */}
      <div
        className="relative z-10 bg-card"
        style={{ transform: `translateX(${offsetX}px)`, transition: rowTransition }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        // Close snap when tapping the row itself
        onClick={snapped !== "none" ? resetSwipe : undefined}
      >
        {/* Main row — desktop hover shows action icons */}
        <div className="group grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {item.product.name}
            </p>
            <div className="flex flex-wrap gap-x-3 mt-0.5">
              {item.product.sku && (
                <span className="text-xs font-mono text-muted-foreground">
                  {item.product.sku}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            </div>
            {/* kg · €/kg line hidden when edit is open */}
            {!editOpen && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {(item.sizeKg != null
                  ? (item.sizeKg * item.quantity)
                  : item.quantity
                ).toFixed(2)} kg · €{(item.unitPrice ?? item.product.pricePerKg).toFixed(2)}/kg
              </p>
            )}
          </div>

          <div className="flex items-start gap-1.5 shrink-0 pt-0.5">
            {/* Desktop action icons — hidden on touch (shown only md+) */}
            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openEdit(); }}
                className="p-1.5 rounded-lg text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-sm font-medium text-foreground tabular-nums">
              €{lineTotal.toFixed(2)}
            </p>
          </div>
        </div>

        {/* ── Inline edit panel ── */}
        <AnimatePresence>
          {editOpen && (
            <motion.div
              key="edit-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
              className="overflow-hidden border-t border-border"
            >
              <div className="px-4 py-3 space-y-3 bg-muted/20">

                {/* Quantity stepper */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Quantité</span>
                  <div className="flex items-center gap-0">
                    <button
                      type="button"
                      onClick={() => setEditQty((q) => Math.max(1, q - 1))}
                      className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                    >
                      <Minus className="w-4 h-4 text-foreground" />
                    </button>
                    <span className="w-10 text-center text-base font-semibold tabular-nums text-foreground">
                      {editQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditQty((q) => q + 1)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                    >
                      <Plus className="w-4 h-4 text-foreground" />
                    </button>
                  </div>
                </div>

                {/* Variant chips — only shown when product has multiple sizes */}
                {hasVariants && (
                  <div>
                    <span className="text-sm text-muted-foreground">Format</span>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {variants!.map((v) => {
                        const isSelected = editVariant?.size_label === v.size_label;
                        return (
                          <button
                            key={v.size_label}
                            type="button"
                            onClick={() => setEditVariant(v)}
                            className={cn(
                              "flex flex-col items-center rounded-xl border px-3 py-2 text-left transition-colors",
                              isSelected
                                ? "border-primary bg-primary/8 text-primary"
                                : "border-border bg-card text-foreground hover:border-primary/50",
                            )}
                          >
                            <span className="text-sm font-semibold">
                              {resolveVariantLabel(v)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              €{v.price.toFixed(2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Save / Cancel */}
                <div className="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex-1 h-9 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Enregistrer
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
