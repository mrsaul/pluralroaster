import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CartBar } from "@/components/CartBar";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MOCK_PRODUCTS, type Product, type ProductVariant } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, ClipboardList, House, ShoppingBag, RefreshCw, MapPin, Coffee, Minus, Plus, Leaf, Package } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ProductRow = Tables<"products">;

type UsualOrderPreset = {
  name: string;
  quantity: number;
};

interface CatalogPageProps {
  cart: {
    items: { product: Product; quantity: number; sizeLabel?: string; sizeKg?: number; unitPrice?: number }[];
    totalKg: number;
    totalPrice: number;
    getQuantity: (id: string, sizeLabel?: string) => number;
    updateQuantity: (product: Product, qty: number, sizeLabel?: string, sizeKg?: number, unitPrice?: number) => void;
    hydrateCart: (items: { product: Product; quantity: number; sizeLabel?: string; sizeKg?: number; unitPrice?: number }[]) => void;
  };
  usualOrderItems: { product: Product; quantity: number; sizeLabel?: string; sizeKg?: number; unitPrice?: number }[];
  lastOrderDate?: string | null;
  lastOrderTotal?: number | null;
  mode: "home" | "shop";
  onCheckout: () => void;
  onReorderLastOrder: () => void;
  onGoHome: () => void;
  onGoShop: () => void;
  onViewOrders: () => void;
  onLogout: () => void;
}

const USUAL_ORDER_PRESET: UsualOrderPreset[] = [
  { name: "Colombia Huila", quantity: 2 },
  { name: "Ethiopia Washed", quantity: 1 },
  { name: "Brazil Espresso", quantity: 3 },
];

const normalizeRoastLevel = (roastLevel: string | null): Product["roastLevel"] => {
  if (roastLevel === "light" || roastLevel === "medium" || roastLevel === "dark" || roastLevel === "espresso") {
    return roastLevel;
  }
  return "medium";
};

const mapProductRow = (product: ProductRow, variants?: ProductVariant[]): Product => {
  const row = product as any;
  const isCustom = row.data_source_mode === "custom";
  return {
    id: product.id,
    name: isCustom && row.custom_name ? row.custom_name : product.name,
    origin: product.origin ?? "Unknown origin",
    sku: product.sku ?? product.sellsy_id,
    pricePerKg: isCustom && row.custom_price_per_kg != null ? Number(row.custom_price_per_kg) : product.price_per_kg,
    roastLevel: normalizeRoastLevel(product.roast_level),
    available: product.is_active,
    description: product.description ?? undefined,
    imageUrl: row.image_url ?? null,
    tags: row.tags ?? [],
    tastingNotes: row.tasting_notes ?? null,
    process: row.process ?? null,
    variants: variants && variants.length > 0 ? variants : undefined,
  };
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/* ── Roast color map ── */
const ROAST_GRADIENT: Record<string, string> = {
  light: "from-amber-100 to-amber-200",
  medium: "from-amber-300 to-amber-500",
  dark: "from-amber-700 to-amber-900",
  espresso: "from-stone-700 to-stone-900",
};

const ROAST_TEXT: Record<string, string> = {
  light: "text-amber-800",
  medium: "text-amber-900",
  dark: "text-amber-100",
  espresso: "text-stone-100",
};

/* ── Size Quantity Stepper ── */
function SizeQuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => onChange(Math.max(0, value - 1))}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
          value > 0
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "bg-transparent text-muted-foreground/40"
        )}
        aria-label="Decrease"
        disabled={value <= 0}
      >
        <Minus className="w-3.5 h-3.5" />
      </motion.button>
      <span className={cn(
        "w-7 text-center font-mono text-sm tabular-nums font-semibold transition-colors",
        value > 0 ? "text-foreground" : "text-muted-foreground/50"
      )}>
        {value}
      </span>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => onChange(value + 1)}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
          value > 0
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-primary/10 text-primary hover:bg-primary/20"
        )}
        aria-label="Increase"
      >
        <Plus className="w-3.5 h-3.5" />
      </motion.button>
    </div>
  );
}

/* ── Product Card Skeleton ── */
function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full mt-2" />
      </div>
    </div>
  );
}

/* ── Modern Product Card ── */
function CatalogProductCard({
  product,
  cart,
}: {
  product: Product;
  cart: CatalogPageProps["cart"];
}) {
  const hasVariants = product.variants && product.variants.length > 0;
  const hasImage = !!product.imageUrl;
  const roastGrad = ROAST_GRADIENT[product.roastLevel] || ROAST_GRADIENT.medium;
  const roastText = ROAST_TEXT[product.roastLevel] || ROAST_TEXT.medium;

  // Check if any variant/size has items in cart
  const hasAnyInCart = hasVariants
    ? product.variants!.some((v) => cart.getQuantity(product.id, v.size_label) > 0)
    : cart.getQuantity(product.id) > 0;

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border bg-card overflow-hidden transition-all duration-300",
        hasAnyInCart
          ? "border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_4px_16px_-4px_hsl(var(--primary)/0.12)]"
          : "border-border shadow-subtle hover:shadow-md"
      )}
    >
      {/* Hero section — image or gradient */}
      {hasImage ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
          <img
            src={product.imageUrl!}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            loading="lazy"
          />
          {/* Floating roast badge */}
          <div className={cn(
            "absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-md bg-background/70 text-foreground"
          )}>
            {product.roastLevel}
          </div>
        </div>
      ) : (
        <div className={cn(
          "relative aspect-[16/6] w-full bg-gradient-to-br flex items-center justify-center",
          roastGrad
        )}>
          <Coffee className={cn("w-10 h-10 opacity-30", roastText)} />
          <div className={cn(
            "absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
            "bg-background/70 text-foreground backdrop-blur-md"
          )}>
            {product.roastLevel}
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Title + origin */}
        <div>
          <h3 className="text-[15px] font-semibold leading-tight text-foreground tracking-tight">
            {product.name}
          </h3>
          {product.origin && product.origin !== "Unknown origin" && (
            <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3 shrink-0" />
              {product.origin}
            </p>
          )}
        </div>

        {/* Tasting notes */}
        {product.tastingNotes && (
          <p className="text-[13px] leading-relaxed text-muted-foreground italic border-l-2 border-primary/20 pl-2.5">
            {product.tastingNotes}
          </p>
        )}

        {/* Inline metadata chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {product.process && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Leaf className="w-3 h-3" />
              {product.process}
            </span>
          )}
          {product.tags && product.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Pricing + Stepper */}
        <div className="border-t border-border pt-3 space-y-2.5">
          {hasVariants ? (
            product.variants!.map((v) => {
              const qty = cart.getQuantity(product.id, v.size_label);
              return (
                <div key={v.size_label} className={cn(
                  "flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors",
                  qty > 0 ? "bg-primary/5" : "bg-transparent"
                )}>
                  <div className="flex items-center gap-2.5">
                    <span className={cn(
                      "inline-flex items-center justify-center rounded-lg text-xs font-bold tabular-nums min-w-[44px] h-7 px-2 transition-colors",
                      qty > 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {v.size_label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      €{v.price.toFixed(2)}
                    </span>
                  </div>
                  <SizeQuantityStepper
                    value={qty}
                    onChange={(q) => cart.updateQuantity(product, q, v.size_label, v.size_kg, v.price)}
                  />
                </div>
              );
            })
          ) : (
            <div className={cn(
              "flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors",
              hasAnyInCart ? "bg-primary/5" : "bg-transparent"
            )}>
              <div>
                <span className="text-lg font-bold tabular-nums text-foreground">
                  €{product.pricePerKg.toFixed(2)}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">/kg</span>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Package className="w-3 h-3" /> 3 kg bags
                </p>
              </div>
              <SizeQuantityStepper
                value={cart.getQuantity(product.id)}
                onChange={(qty) => cart.updateQuantity(product, qty)}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function CatalogPage({ cart, usualOrderItems, lastOrderDate, lastOrderTotal, mode, onCheckout, onReorderLastOrder, onGoHome, onGoShop, onViewOrders, onLogout }: CatalogPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  
  const initializedUsualOrder = useRef(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError(null);

    const { data, error } = await supabase
      .from("products")
      .select("id, sellsy_id, sku, name, description, origin, roast_level, price_per_kg, is_active, image_url, tags, tasting_notes, process, data_source_mode, custom_name, custom_price_per_kg")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      setProductsError(error.message);
      setProducts(MOCK_PRODUCTS.filter((product) => product.available));
      setLoadingProducts(false);
      return;
    }

    const { data: variantsData } = await supabase
      .from("product_variants")
      .select("id, product_id, size_label, size_kg, price, sku, is_active")
      .eq("is_active", true)
      .order("size_kg", { ascending: true });

    const variantsByProduct = new Map<string, ProductVariant[]>();
    ((variantsData ?? []) as any[]).forEach((v) => {
      const list = variantsByProduct.get(v.product_id) ?? [];
      list.push({
        id: v.id,
        size_label: v.size_label,
        size_kg: Number(v.size_kg),
        price: Number(v.price),
        sku: v.sku,
        is_active: v.is_active,
      });
      variantsByProduct.set(v.product_id, list);
    });

    const remoteProducts = (data ?? []).map((p) => mapProductRow(p as unknown as ProductRow, variantsByProduct.get(p.id)));
    setProducts(remoteProducts.length > 0 ? remoteProducts : []);
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const visibleProducts = useMemo(() => products.filter((product) => product.available), [products]);

  const fallbackUsualOrderProducts = useMemo(() => {
    return USUAL_ORDER_PRESET.map((preset) => {
      const product = visibleProducts.find((item) => normalizeName(item.name).includes(normalizeName(preset.name)));
      return product ? { product, quantity: preset.quantity } : null;
    }).filter((entry): entry is { product: Product; quantity: number } => Boolean(entry));
  }, [visibleProducts]);

  const resolvedUsualOrderItems = usualOrderItems.length > 0 ? usualOrderItems : fallbackUsualOrderProducts;

  useEffect(() => {
    if (initializedUsualOrder.current || resolvedUsualOrderItems.length === 0) {
      return;
    }

    cart.hydrateCart(resolvedUsualOrderItems);
    initializedUsualOrder.current = true;
  }, [cart, resolvedUsualOrderItems]);

  const usualOrderTotal = useMemo(() => {
    return resolvedUsualOrderItems.reduce((sum, { product }) => {
      const quantity = cart.getQuantity(product.id);
      return sum + quantity * product.pricePerKg;
    }, 0);
  }, [cart, resolvedUsualOrderItems]);

  const usualOrderHasItems = resolvedUsualOrderItems.some(({ product }) => cart.getQuantity(product.id) > 0);
  

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">PluralRoaster</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {mode === "home" ? "Your latest order" : `${visibleProducts.length} coffees available`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mode === "shop" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void loadProducts()}
                disabled={loadingProducts}
                className="rounded-full h-9 w-9"
              >
                <RefreshCw className={cn("h-4 w-4", loadingProducts && "animate-spin")} />
              </Button>
            )}
            <button onClick={onLogout} className="p-2 rounded-full transition-colors hover:bg-muted" aria-label="Logout">
              <LogOut className="w-4.5 h-4.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-40">
        {/* ── HOME MODE ── */}
        {mode === "home" && (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Quick order</p>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">Your usual order</h2>
            </div>

            <div className="space-y-4">
              {resolvedUsualOrderItems.map(({ product }) => (
                <div key={product.id} className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">{product.name}</p>
                  {product.variants && product.variants.length > 0 ? (
                    <div className="space-y-1.5">
                      {product.variants.map((v) => (
                        <div key={v.size_label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-10">{v.size_label}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">€{v.price.toFixed(2)}</span>
                          </div>
                          <SizeQuantityStepper
                            value={cart.getQuantity(product.id, v.size_label)}
                            onChange={(qty) => cart.updateQuantity(product, qty, v.size_label, v.size_kg, v.price)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs tabular-nums text-muted-foreground">€{product.pricePerKg.toFixed(2)}/kg</span>
                      <SizeQuantityStepper
                        value={cart.getQuantity(product.id)}
                        onChange={(qty) => cart.updateQuantity(product, qty)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Total</p>
                <p className="text-3xl font-bold tabular-nums text-foreground mt-1">{Math.round(cart.totalPrice)} €</p>
                <p className="text-xs text-muted-foreground tabular-nums">{cart.totalKg.toFixed(2)} kg</p>
              </div>
              {(lastOrderDate || lastOrderTotal) && (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Last order</p>
                  <div className="mt-1.5 flex items-center justify-between gap-4 text-sm">
                    <span className="text-foreground">{lastOrderDate ? format(new Date(lastOrderDate), "MMMM d, yyyy") : "—"}</span>
                    <span className="font-semibold tabular-nums text-foreground">{typeof lastOrderTotal === "number" ? `${Math.round(lastOrderTotal)} €` : "—"}</span>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={onReorderLastOrder}
                  disabled={cart.items.length === 0}
                  className="w-full rounded-xl h-12"
                >
                  Reorder last order
                </Button>
                <Button
                  size="lg"
                  onClick={onCheckout}
                  disabled={cart.items.length === 0}
                  className="w-full rounded-xl h-12 font-semibold"
                >
                  Confirm Order
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* ── SHOP MODE ── */}
        {mode === "shop" && (
          <div className="space-y-4">
            {/* Loading skeletons */}
            {loadingProducts && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Error state */}
            {!loadingProducts && productsError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4">
                <p className="text-sm font-medium text-foreground">Couldn't load the synced catalog.</p>
                <p className="mt-1 text-xs text-muted-foreground">Showing the default product list for now.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadProducts()} className="mt-3 rounded-full">
                  Retry
                </Button>
              </div>
            )}

            {/* Empty state */}
            {!loadingProducts && !productsError && visibleProducts.length === 0 && (
              <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
                <Coffee className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No products available</p>
                <p className="text-xs text-muted-foreground mt-1">Ask an admin to sync the catalog.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadProducts()} className="mt-4 rounded-full">
                  Refresh
                </Button>
              </div>
            )}

            {/* Product grid */}
            {!loadingProducts && visibleProducts.length > 0 && (
              <motion.div
                className="space-y-4"
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.06 } },
                }}
              >
                {visibleProducts.map((product) => (
                  <motion.div
                    key={product.id}
                    variants={{
                      hidden: { opacity: 0, y: 12 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                    <CatalogProductCard product={product} cart={cart} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        )}
      </main>

      {/* ── Bottom Navigation ── */}
      <div className="fixed inset-x-0 bottom-4 z-50 px-4">
        <div className="mx-auto flex max-w-lg items-center justify-between rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur-lg supports-[backdrop-filter]:bg-card/85">
          {[
            { label: "Home", icon: House, onClick: onGoHome, active: mode === "home" },
            { label: "Shop", icon: ShoppingBag, onClick: onGoShop, active: mode === "shop" },
            { label: "Orders", icon: ClipboardList, onClick: onViewOrders, active: false },
          ].map(({ label, icon: Icon, onClick, active }) => (
            <button
              key={label}
              onClick={onClick}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cart Bar ── */}
      {cart.items.length > 0 && mode === "shop" && (
        <CartBar totalKg={cart.totalKg} totalPrice={cart.totalPrice} onCheckout={onCheckout} />
      )}
    </div>
  );
}