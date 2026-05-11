import { useState, useEffect } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

type Variant = {
  id: string;
  size_label: string;
  size_kg: number;
  price: number;
  sku: string | null;
  is_active: boolean;
  source: string;
  sellsy_declination_id: number | null;
};

interface ProductVariantsEditorProps {
  productId: string;
  productName: string;
  basePricePerKg: number;
}

export function ProductVariantsEditor({ productId }: ProductVariantsEditorProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .from("product_variants")
      .select("id, size_label, size_kg, price, sku, is_active, source, sellsy_declination_id")
      .eq("product_id", productId)
      .order("size_kg", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) {
          setVariants(
            (data ?? []).map((v) => ({
              id: v.id,
              size_label: v.size_label,
              size_kg: Number(v.size_kg),
              price: Number(v.price),
              sku: v.sku ?? null,
              is_active: v.is_active,
              source: v.source ?? "manual",
              sellsy_declination_id: v.sellsy_declination_id ?? null,
            })),
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading variants…
      </div>
    );
  }

  const sellsyVariants = variants.filter((v) => v.source === "sellsy" && v.is_active);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Bag Sizes & Pricing</p>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Managed in Sellsy
        </span>
      </div>

      {sellsyVariants.length > 0 ? (
        <div className="space-y-2">
          {sellsyVariants.map((variant) => (
            <div
              key={variant.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-2.5"
            >
              <div className="w-14 text-center">
                <span className="text-sm font-semibold text-foreground">{variant.size_label}</span>
              </div>
              <div className="flex-1 text-sm text-muted-foreground">
                <span className="tabular-nums font-medium text-foreground">
                  €{variant.price.toFixed(2)}
                </span>
                {variant.sku && (
                  <span className="ml-2 font-mono text-[11px]">{variant.sku}</span>
                )}
              </div>
              <Badge variant="secondary" className="text-[10px]">
                #{variant.sellsy_declination_id}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No Sellsy variants found. Run a product sync to import sizes from Sellsy.
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Variants are managed in Sellsy as Declinations. Run a product sync to refresh.
      </p>
    </div>
  );
}
