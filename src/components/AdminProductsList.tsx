import { ChevronRight, Coffee, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ProductListItem = {
  id: string;
  sellsy_id: string;
  sku: string | null;
  name: string;
  custom_name: string | null;
  origin: string | null;
  roast_level: string | null;
  price_per_kg: number;
  custom_price_per_kg: number | null;
  data_source_mode: string;
  is_active: boolean;
  image_url: string | null;
  kind: string | null;
};

interface AdminProductsListProps<T extends ProductListItem> {
  products: T[];
  loading: boolean;
  error: string | null;
  onOpen: (product: T) => void;
  onDelete: (product: T) => void;
}

function display(product: ProductListItem) {
  const isCustom = product.data_source_mode === "custom";
  return {
    isCustom,
    name: isCustom && product.custom_name ? product.custom_name : product.name,
    price: isCustom && product.custom_price_per_kg != null ? product.custom_price_per_kg : product.price_per_kg,
  };
}

function Thumb({ product }: { product: ProductListItem }) {
  return product.image_url ? (
    <img src={product.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover border border-border md:h-8 md:w-8" />
  ) : (
    <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center md:h-8 md:w-8">
      <Coffee className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

/** Admin Produits: cards on phones, table from md up. The Loberz delivery service is not listed. */
export function AdminProductsList<T extends ProductListItem>({ products, loading, error, onOpen, onDelete }: AdminProductsListProps<T>) {
  const coffees = products.filter((p) => p.kind !== "service");
  const emptyText = loading ? "Chargement des produits…" : coffees.length === 0 ? "Aucun produit." : null;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {error && (
        <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Impossible de charger les produits</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Phones: one card per coffee */}
      <ul aria-label="Produits" className="md:hidden divide-y divide-border">
        {emptyText ? (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</li>
        ) : (
          coffees.map((product) => {
            const d = display(product);
            const details = [product.origin, product.roast_level].filter(Boolean).join(" · ");
            return (
              <li key={product.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(product)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-muted/60"
                >
                  <Thumb product={product} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium text-foreground break-words">{d.name}</p>
                    {details && <p className="text-xs text-muted-foreground capitalize">{details}</p>}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs">
                      <span className="font-medium tabular-nums text-foreground">€{d.price.toFixed(2)}/kg</span>
                      <span className="text-muted-foreground">{product.is_active ? "Actif" : "Archivé"}</span>
                      {d.isCustom && (
                        <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground">Personnalisé</Badge>
                      )}
                      {product.sku && <span className="font-mono text-muted-foreground">{product.sku}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Supprimer ${d.name}`}
                  className="mr-2 h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(product)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })
        )}
      </ul>

      {/* Wider screens: full table */}
      <div data-wide-table className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Produit</TableHead>
              <TableHead>Origine</TableHead>
              <TableHead>Torréfaction</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Prix</TableHead>
              <TableHead className="text-right">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emptyText ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{emptyText}</TableCell></TableRow>
            ) : (
              coffees.map((product) => {
                const d = display(product);
                return (
                  <TableRow key={product.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onOpen(product)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb product={product} />
                        <div>
                          <p className="font-medium text-foreground">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{product.sellsy_id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.origin ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{product.roast_level ?? "—"}</TableCell>
                    <TableCell className="font-mono text-foreground">{product.sku ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground font-medium">€{d.price.toFixed(2)}/kg</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {d.isCustom && (
                          <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground">Personnalisé</Badge>
                        )}
                        <span className="text-muted-foreground">{product.is_active ? "Actif" : "Archivé"}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Supprimer ${d.name}`}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); onDelete(product); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
