import { useEffect, useState, useCallback } from "react";
import { Drawer, DrawerContent, DrawerClose } from "@/components/ui/drawer";
import { X, Minus, Plus, Coffee, MapPin, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant } from "@/lib/store";

// ── Color helpers (shared with catalog) ──────────────────────────────────────

const ROAST_GRADIENT: Record<string, string> = {
  light:    "from-amber-100 to-amber-200",
  medium:   "from-amber-300 to-amber-500",
  dark:     "from-amber-700 to-amber-900",
  espresso: "from-stone-700 to-stone-900",
};
const ROAST_TEXT: Record<string, string> = {
  light:    "text-amber-800",
  medium:   "text-amber-900",
  dark:     "text-amber-100",
  espresso: "text-stone-100",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProductDetailSheetProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  getQuantity: (productId: string, sizeLabel?: string) => number;
  updateQuantity: (
    product: Product,
    qty: number,
    sizeLabel?: string,
    sizeKg?: number,
    unitPrice?: number,
  ) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductDetailSheet({
  product,
  open,
  onClose,
  getQuantity,
  updateQuantity,
}: ProductDetailSheetProps) {
  const hasVariants = !!(product?.variants && product.variants.length > 0);

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // Reset + seed state when sheet opens or product switches
  useEffect(() => {
    if (!product || !open) return;
    setAdded(false);
    if (hasVariants) {
      const first = product.variants![0];
      setSelectedVariant(first);
      const existing = getQuantity(product.id, first.size_label);
      setQuantity(existing > 0 ? existing : 1);
    } else {
      setSelectedVariant(null);
      const existing = getQuantity(product.id);
      setQuantity(existing > 0 ? existing : 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, open]);

  // When variant changes, load its current cart qty
  useEffect(() => {
    if (!product || !selectedVariant || !open) return;
    const existing = getQuantity(product.id, selectedVariant.size_label);
    setQuantity(existing > 0 ? existing : 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariant?.size_label]);

  const currentCartQty = product
    ? hasVariants && selectedVariant
      ? getQuantity(product.id, selectedVariant.size_label)
      : getQuantity(product.id)
    : 0;

  const isUpdate = currentCartQty > 0;

  const unitPrice = hasVariants && selectedVariant ? selectedVariant.price : null;
  const lineTotal =
    unitPrice != null
      ? unitPrice * quantity
      : (product?.pricePerKg ?? 0) * quantity;

  const handleAdd = useCallback(() => {
    if (!product || added) return;
    if (hasVariants && selectedVariant) {
      updateQuantity(
        product,
        quantity,
        selectedVariant.size_label,
        selectedVariant.size_kg,
        selectedVariant.price,
      );
    } else {
      updateQuantity(product, quantity);
    }
    // Haptic feedback on mobile
    if ("vibrate" in navigator) navigator.vibrate(50);
    setAdded(true);
    setTimeout(onClose, 800);
  }, [product, quantity, selectedVariant, hasVariants, updateQuantity, onClose, added]);

  if (!product) return null;

  const roastGrad = ROAST_GRADIENT[product.roastLevel] ?? ROAST_GRADIENT.medium;
  const roastText = ROAST_TEXT[product.roastLevel] ?? ROAST_TEXT.medium;

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent className="max-h-[92dvh] flex flex-col">
        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 overscroll-contain">

          {/* Close button — absolute over image */}
          <div className="relative">
            <div className="absolute top-3 right-3 z-10">
              <DrawerClose asChild>
                <button
                  className="w-8 h-8 rounded-full bg-background/85 backdrop-blur-md flex items-center justify-center shadow-md"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-foreground" />
                </button>
              </DrawerClose>
            </div>

            {/* Hero image / gradient */}
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-52 object-cover"
              />
            ) : (
              <div className={cn(
                "w-full h-52 bg-gradient-to-br flex items-center justify-center",
                roastGrad,
              )}>
                <Coffee className={cn("w-14 h-14 opacity-25", roastText)} />
              </div>
            )}

            {/* Roast badge */}
            <div className="absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-background/85 backdrop-blur-md text-foreground">
              {product.roastLevel}
            </div>
          </div>

          <div className="px-5 pt-4 pb-6 space-y-5">
            {/* Title + meta */}
            <div>
              <h2 className="text-[20px] font-bold text-foreground leading-tight tracking-tight">
                {product.name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                {product.origin && product.origin !== "Unknown origin" && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {product.origin}
                  </span>
                )}
                {product.process && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{product.process}</span>
                  </>
                )}
                <>
                  <span aria-hidden>·</span>
                  <span className="capitalize">{product.roastLevel} roast</span>
                </>
              </div>
            </div>

            {/* Tasting notes */}
            {product.tastingNotes && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Tasting notes
                </p>
                <p className="text-sm text-foreground italic leading-relaxed">
                  "{product.tastingNotes}"
                </p>
              </div>
            )}

            {/* Size selector */}
            {hasVariants && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                  Choose your size
                </p>
                <div className="flex gap-2">
                  {product.variants!.map((variant) => {
                    const isSelected = selectedVariant?.size_label === variant.size_label;
                    return (
                      <button
                        key={variant.size_label}
                        type="button"
                        onClick={() => setSelectedVariant(variant)}
                        className={cn(
                          "flex-1 rounded-xl border-2 py-3 px-2 text-center transition-all duration-150",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:border-primary/40",
                        )}
                      >
                        <p className={cn(
                          "text-sm font-semibold",
                          isSelected ? "text-foreground" : "text-muted-foreground",
                        )}>
                          {variant.size_label}
                        </p>
                        <p className="text-xs mt-0.5 tabular-nums text-muted-foreground">
                          €{variant.price.toFixed(2)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No variants — show price/kg */}
            {!hasVariants && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="text-lg font-bold text-foreground tabular-nums">
                  €{product.pricePerKg.toFixed(2)}
                </span>
                <span>/kg · bulk bags</span>
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-border" />

            {/* Quantity + line total */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Quantity
                </p>
                <div className="flex items-center gap-3">
                  {/* Minus — 44×44px touch target */}
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className={cn(
                      "w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-150",
                      quantity <= 1
                        ? "border-border text-muted-foreground/30 cursor-not-allowed"
                        : "border-border text-foreground hover:border-primary/50 active:bg-muted",
                    )}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <span className="w-8 text-center text-xl font-bold tabular-nums text-foreground">
                    {quantity}
                  </span>

                  {/* Plus — 44×44px touch target */}
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 active:opacity-75 transition-opacity"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs text-muted-foreground">Line total</p>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  €{lineTotal.toFixed(2)}
                </p>
              </div>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleAdd}
              disabled={added}
              className={cn(
                "w-full h-14 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 transition-all duration-300",
                added
                  ? "bg-green-500 text-white"
                  : "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80",
              )}
            >
              {added ? (
                <>
                  <Check className="w-5 h-5" />
                  Added ✓
                </>
              ) : isUpdate ? (
                "Update order"
              ) : (
                "Add to order"
              )}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
