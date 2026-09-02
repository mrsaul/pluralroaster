import { useEffect, useMemo, useState, useCallback } from "react";
import { useT } from "@/i18n";
import { CartBar } from "@/components/CartBar";
import { ProductDetailSheet } from "@/components/ProductDetailSheet";
import { resolveVariantLabel } from "@/lib/orderUtils";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { MOCK_PRODUCTS, type Product, type ProductVariant, type Order } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  House,
  ShoppingBag,
  UserCircle2,
  RefreshCw,
  MapPin,
  Coffee,
  Search,
  X,
  ChevronRight,
  Package,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductRow = Tables<"products">;

interface CatalogPageProps {
  cart: {
    items: { product: Product; quantity: number; sizeLabel?: string; sizeKg?: number; unitPrice?: number }[];
    totalKg: number;
    totalPrice: number;
    getQuantity: (id: string, sizeLabel?: string) => number;
    updateQuantity: (
      product: Product,
      qty: number,
      sizeLabel?: string,
      sizeKg?: number,
      unitPrice?: number,
    ) => void;
    hydrateCart: (
      items: { product: Product; quantity: number; sizeLabel?: string; sizeKg?: number; unitPrice?: number }[],
    ) => void;
  };
  usualOrderItems: {
    product: Product;
    quantity: number;
    sizeLabel?: string;
    sizeKg?: number;
    unitPrice?: number;
  }[];
  lastOrder?: Order | null;
  mode: "home" | "shop";
  onCheckout: () => void;
  onReorderLastOrder: () => void;
  onGoHome: () => void;
  onGoShop: () => void;
  onGoAccount: () => void;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

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

const ROAST_OPTIONS = ["light", "medium", "dark", "espresso"] as const;

// ── Data helpers ──────────────────────────────────────────────────────────────

const normalizeRoastLevel = (roastLevel: string | null): Product["roastLevel"] => {
  if (
    roastLevel === "light" ||
    roastLevel === "medium" ||
    roastLevel === "dark" ||
    roastLevel === "espresso"
  ) {
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
    pricePerKg:
      isCustom && row.custom_price_per_kg != null
        ? Number(row.custom_price_per_kg)
        : product.price_per_kg,
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

// ── Compact Product Card ──────────────────────────────────────────────────────

function ProductCard({
  product,
  cartBadge,
  onClick,
}: {
  product: Product;
  cartBadge: number;
  onClick: () => void;
}) {
  const hasImage = !!product.imageUrl;
  const roastGrad = ROAST_GRADIENT[product.roastLevel] ?? ROAST_GRADIENT.medium;
  const roastText = ROAST_TEXT[product.roastLevel] ?? ROAST_TEXT.medium;
  const t = useT();
  const minPrice =
    product.variants && product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.price))
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-xl overflow-hidden border bg-card text-left w-full active:scale-[0.97] transition-transform duration-100",
        cartBadge > 0 ? "border-primary/40" : "border-border",
      )}
    >
      {/* Cart badge */}
      {cartBadge > 0 && (
        <span className="absolute top-2 right-2 z-10 min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
          {cartBadge}
        </span>
      )}

      {/* Hero — image or roast gradient */}
      {hasImage ? (
        <img
          src={product.imageUrl!}
          alt={product.name}
          className="w-full aspect-square object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            "w-full aspect-square bg-gradient-to-br flex items-center justify-center",
            roastGrad,
          )}
        >
          <Coffee className={cn("w-8 h-8 opacity-25", roastText)} />
        </div>
      )}

      {/* Roast badge */}
      <div className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-background/80 backdrop-blur-sm text-foreground">
        {product.roastLevel}
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-0.5">
        <p className="text-[13px] font-semibold text-foreground leading-tight line-clamp-2">
          {product.name}
        </p>
        {product.origin && product.origin !== "Unknown origin" && (
          <p className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{product.origin}</span>
          </p>
        )}
        <p className="text-[12px] font-semibold text-foreground pt-0.5 tabular-nums">
          {minPrice != null
            ? t.catalog.fromPrice(`€${minPrice.toFixed(2)}`)
            : `€${product.pricePerKg.toFixed(2)}/kg`}
        </p>
      </div>
    </button>
  );
}

// ── Product Card Skeleton ─────────────────────────────────────────────────────

function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <div className="p-2.5 space-y-1.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CatalogPage({
  cart,
  usualOrderItems,
  lastOrder,
  mode,
  onCheckout,
  onReorderLastOrder,
  onGoHome,
  onGoShop,
  onGoAccount,
}: CatalogPageProps) {
  const t = useT();

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeRoasts, setActiveRoasts] = useState<Set<string>>(new Set());

  // Detail sheet
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Load products ─────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError(null);

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, sellsy_id, sku, name, description, origin, roast_level, price_per_kg, is_active, image_url, tags, tasting_notes, process, data_source_mode, custom_name, custom_price_per_kg",
      )
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      setProductsError(error.message);
      setProducts(MOCK_PRODUCTS.filter((p) => p.available));
      setLoadingProducts(false);
      return;
    }

    const { data: variantsData } = await supabase
      .from("product_variants")
      .select("id, product_id, size_label, size_kg, price, sku, is_active, source, sellsy_declination_id")
      .eq("is_active", true)
      .eq("source", "sellsy")
      .order("size_kg", { ascending: true });

    const variantsByProduct = new Map<string, ProductVariant[]>();
    ((variantsData ?? []) as any[]).forEach((v) => {
      const list = variantsByProduct.get(v.product_id) ?? [];
      const mapped: ProductVariant = {
        id: v.id,
        size_label: v.size_label,
        size_kg: Number(v.size_kg),
        price: Number(v.price),
        sku: v.sku ?? null,
        is_active: v.is_active,
        source: (v.source as "sellsy" | "manual") ?? "sellsy",
        sellsy_declination_id: v.sellsy_declination_id ?? null,
      };
      list.push(mapped);
      variantsByProduct.set(v.product_id, list);
    });

    const remoteProducts = (data ?? []).map((p) => {
      return mapProductRow(p as unknown as ProductRow, variantsByProduct.get(p.id));
    });
    setProducts(remoteProducts.length > 0 ? remoteProducts : []);
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // ── Debounce search query ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Filter products ───────────────────────────────────────────────────────
  const visibleProducts = useMemo(
    () => products.filter((p) => p.available),
    [products],
  );

  const filteredProducts = useMemo(() => {
    let result = visibleProducts;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.origin.toLowerCase().includes(q) ||
          (p.tastingNotes?.toLowerCase().includes(q) ?? false),
      );
    }
    if (activeRoasts.size > 0) {
      result = result.filter((p) => activeRoasts.has(p.roastLevel));
    }
    return result;
  }, [visibleProducts, debouncedSearch, activeRoasts]);

  const hasActiveFilters = debouncedSearch.trim().length > 0 || activeRoasts.size > 0;

  const toggleRoast = useCallback((roast: string) => {
    setActiveRoasts((prev) => {
      const next = new Set(prev);
      if (next.has(roast)) next.delete(roast);
      else next.add(roast);
      return next;
    });
  }, []);

  // ── Detail sheet handlers ─────────────────────────────────────────────────
  const openProduct = useCallback((product: Product) => {
    setSelectedProduct(product);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  // ── Cart badge per product ────────────────────────────────────────────────
  const getCartBadge = useCallback(
    (product: Product): number => {
      if (product.variants && product.variants.length > 0) {
        return product.variants.reduce(
          (sum, v) => sum + cart.getQuantity(product.id, v.size_label),
          0,
        );
      }
      return cart.getQuantity(product.id);
    },
    [cart],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border">

        {/* Top bar — always visible */}
        <div className="px-4 pt-[max(20px,calc(env(safe-area-inset-top)+16px))] pb-2">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                {mode === "home" ? t.catalog.home : t.catalog.shop}
              </h1>
              {mode === "shop" && !loadingProducts && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t.catalog.coffeeCount(filteredProducts.length)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {mode === "shop" && (
                <button
                  type="button"
                  onClick={() => void loadProducts()}
                  disabled={loadingProducts}
                  className="p-2 rounded-full transition-colors hover:bg-muted disabled:opacity-40"
                  aria-label={t.catalog.refreshCatalog}
                >
                  <RefreshCw
                    className={cn("w-4 h-4 text-muted-foreground", loadingProducts && "animate-spin")}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={onGoAccount}
                className="p-2 rounded-full transition-colors hover:bg-muted"
                aria-label="Account"
              >
                <UserCircle2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Search + filters — Shop mode only */}
        {mode === "shop" && (
          <>
            <div className="px-4 pb-2">
              <div className="max-w-lg mx-auto relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  placeholder={t.catalog.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/50 pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={t.catalog.clearSearch}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="px-4 pb-3">
              <div className="max-w-lg mx-auto flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setActiveRoasts(new Set())}
                  className={cn(
                    "flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                    activeRoasts.size === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.catalog.filterAll}
                </button>
                {ROAST_OPTIONS.map((roast) => (
                  <button
                    key={roast}
                    type="button"
                    onClick={() => toggleRoast(roast)}
                    className={cn(
                      "flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap",
                      activeRoasts.has(roast)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {roast}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Main content ── */}
      <main className="max-w-lg mx-auto px-4 pt-4 pb-48">

        {/* ── HOME DASHBOARD ── */}
        {mode === "home" && (
          <div className="space-y-5 mb-6">

            {/* Last order card */}
            {lastOrder ? (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {t.catalog.lastOrder}
                </p>
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {t.catalog.productCount(lastOrder.items.length)} · €{lastOrder.totalPrice.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(lastOrder.createdAt), "d MMM yyyy")}
                        {" · "}{t.catalog.deliveryLabel(format(new Date(lastOrder.deliveryDate), "d MMM"))}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                        {lastOrder.items.map((i) => i.product.name).join(", ")}
                      </p>
                    </div>
                    <StatusBadge status={lastOrder.status} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onReorderLastOrder}
                      className="flex-1 rounded-xl bg-primary text-primary-foreground text-xs font-semibold py-2.5 hover:bg-primary/90 transition-colors"
                    >
                      {t.catalog.repeatOrder}
                    </button>
                    <button
                      type="button"
                      onClick={onGoAccount}
                      className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 text-xs font-medium text-foreground px-3 py-2.5 hover:bg-muted transition-colors"
                    >
                      {t.catalog.history}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section>
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                  <Package className="w-7 h-7 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">{t.catalog.noOrdersYet}</p>
                  <button
                    type="button"
                    onClick={onGoShop}
                    className="mt-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 hover:bg-primary/90 transition-colors"
                  >
                    {t.catalog.browseCatalog}
                  </button>
                </div>
              </section>
            )}

            {/* Quick reorder */}
            {usualOrderItems.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.catalog.quickReorder}
                  </p>
                  <button
                    type="button"
                    onClick={onReorderLastOrder}
                    className="flex items-center gap-0.5 text-xs font-semibold text-primary"
                  >
                    {t.catalog.reorderAll}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="-mx-4 px-4 flex gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {usualOrderItems.map(({ product, quantity, sizeLabel, sizeKg }) => {
                    const badge = getCartBadge(product);
                    const displayLabel = sizeLabel ? resolveVariantLabel({ size_label: sizeLabel, size_kg: sizeKg ?? null }) : null;
                    return (
                      <button
                        key={`${product.id}::${sizeLabel ?? ""}`}
                        type="button"
                        onClick={() => openProduct(product)}
                        className="relative flex-shrink-0 w-36 rounded-xl border border-border bg-card p-3 text-left active:scale-[0.97] transition-transform duration-100"
                      >
                        {badge > 0 && (
                          <span className="absolute top-2 right-2 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1">
                            {badge}
                          </span>
                        )}
                        <p className="text-[12px] font-semibold text-foreground leading-tight line-clamp-2 pr-5">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {t.catalog.lastQty(quantity)}{displayLabel ? ` ${displayLabel}` : ""}
                        </p>
                        <p className="mt-2 text-[11px] font-semibold text-primary">{t.catalog.add}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Featured coffees heading */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t.catalog.ourCoffees}
              </p>
              <button
                type="button"
                onClick={onGoShop}
                className="flex items-center gap-0.5 text-xs font-semibold text-primary"
              >
                {t.catalog.browseAll}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Product grid */}
        {loadingProducts ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : productsError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">{t.catalog.couldntLoad}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.catalog.showingDefault}</p>
            <button
              type="button"
              onClick={() => void loadProducts()}
              className="mt-3 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              {t.catalog.retry}
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center">
            <Coffee className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            {hasActiveFilters ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  {t.catalog.noMatch}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.catalog.tryDifferent}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveRoasts(new Set());
                  }}
                  className="mt-4 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {t.catalog.clearFilters}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">{t.catalog.noProducts}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.catalog.askAdmin}
                </p>
                <button
                  type="button"
                  onClick={() => void loadProducts()}
                  className="mt-4 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {t.catalog.refresh}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                cartBadge={getCartBadge(product)}
                onClick={() => openProduct(product)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Bottom Navigation ── */}
      <div className="fixed inset-x-0 bottom-4 z-50 px-4 pointer-events-none">
        <div className="max-w-lg mx-auto flex items-center justify-between rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur-lg supports-[backdrop-filter]:bg-card/85 pointer-events-auto">
          {(
            [
              { labelKey: "home" as const,    icon: House,        onClick: onGoHome,    active: mode === "home" },
              { labelKey: "shop" as const,    icon: ShoppingBag,  onClick: onGoShop,    active: mode === "shop" },
              { labelKey: "account" as const, icon: UserCircle2,  onClick: onGoAccount, active: false },
            ]
          ).map(({ labelKey, icon: Icon, onClick, active }) => (
            <button
              key={labelKey}
              onClick={onClick}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.catalog[labelKey]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cart Bar ── */}
      <CartBar
        itemCount={cart.items.length}
        totalPrice={cart.totalPrice}
        onCheckout={onCheckout}
      />

      {/* ── Product Detail Sheet ── */}
      <ProductDetailSheet
        product={selectedProduct}
        open={sheetOpen}
        onClose={closeSheet}
        getQuantity={cart.getQuantity}
        updateQuantity={cart.updateQuantity}
      />
    </div>
  );
}
