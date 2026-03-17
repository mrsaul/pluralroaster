import { useEffect, useMemo, useState } from "react";
import { LogOut, Package, CheckCircle, Clock, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { MOCK_ORDERS, type Order } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { AdminClientsSection } from "@/components/AdminClientsSection";

type AdminProductRow = {
  id: string;
  sku: string | null;
  name: string;
  origin: string | null;
  roast_level: string | null;
  price_per_kg: number;
  is_active: boolean;
  synced_at: string;
};

type AdminClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  client_type: string | null;
  total_orders: number | null;
  total_spend: number | null;
  last_order_at: string | null;
};

interface AdminDashboardProps {
  orders: Order[];
  onLogout: () => void;
}

export default function AdminDashboard({ orders, onLogout }: AdminDashboardProps) {
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number; at: string } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [clients, setClients] = useState<AdminClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);

  const allOrders = [...MOCK_ORDERS, ...orders];
  const pendingCount = allOrders.filter((o) => o.status === "pending" || o.status === "confirmed").length;
  const syncedCount = allOrders.filter((o) => o.status === "synced").length;
  const totalRevenue = allOrders.reduce((s, o) => s + o.totalPrice, 0);

  const loadProducts = async () => {
    setLoadingProducts(true);

    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, origin, roast_level, price_per_kg, is_active, synced_at")
      .order("name", { ascending: true });

    if (error) {
      setSyncError(error.message);
      setLoadingProducts(false);
      return;
    }

    setProducts((data ?? []) as AdminProductRow[]);
    setLoadingProducts(false);
  };

  const loadClients = async () => {
    setLoadingClients(true);
    setClientError(null);

    try {
      const { data, error } = await supabase.functions.invoke("sellsy-sync", {
        body: { mode: "list-clients" },
      });

      if (error) {
        throw new Error(error.message || "Sellsy client fetch failed");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Unable to load clients from Sellsy");
      }

      setClients(Array.isArray(data.clients) ? (data.clients as AdminClientRow[]) : []);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Unknown Sellsy client error");
    } finally {
      setLoadingClients(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadProducts(), loadClients()]);
  }, []);

  const stats = useMemo(
    () => [
      { label: "To Fulfill", value: pendingCount, icon: Clock, color: "text-primary" },
      { label: "Synced", value: syncedCount, icon: CheckCircle, color: "text-success" },
      { label: "Total Orders", value: allOrders.length, icon: Package, color: "text-foreground" },
      { label: "Revenue", value: `€${totalRevenue.toFixed(0)}`, icon: RefreshCw, color: "text-foreground" },
    ],
    [allOrders.length, pendingCount, syncedCount, totalRevenue],
  );

  const handleSellsyProductSync = async () => {
    setSyncingProducts(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("sellsy-sync", {
        body: { mode: "sync-products" },
      });

      if (error) {
        throw new Error(error.message || "Sellsy sync failed");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Unable to import products from Sellsy");
      }

      setSyncResult({
        count: Number(data.syncedCount ?? 0),
        at: new Date().toISOString(),
      });

      await Promise.all([loadProducts(), loadClients()]);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unknown Sellsy sync error");
    } finally {
      setSyncingProducts(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-card p-6">
        <h1 className="text-base font-medium text-foreground tracking-tight mb-1">PluralRoaster</h1>
        <p className="text-xs text-muted-foreground mb-8">Admin Portal</p>

        <nav className="space-y-1 flex-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium">
            <Package className="w-4 h-4" /> Orders
          </div>
        </nav>

        <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </aside>

      <main className="flex-1 p-4 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex lg:hidden items-center justify-between mb-6">
            <div>
              <h1 className="text-base font-medium text-foreground">PluralRoaster</h1>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-2xl font-medium tabular-nums text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          <section className="mb-8">
            <div className="bg-card border border-border rounded-lg p-4 lg:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium text-foreground">Sellsy Product Sync</h2>
                  <p className="text-xs text-muted-foreground mt-1">Import the latest coffee catalog from Sellsy into Lovable Cloud.</p>
                </div>

                <button
                  type="button"
                  onClick={handleSellsyProductSync}
                  disabled={syncingProducts}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-opacity disabled:opacity-50"
                >
                  {syncingProducts ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing products…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Sync Sellsy Products
                    </>
                  )}
                </button>
              </div>

              {syncResult ? (
                <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">Imported {syncResult.count} product{syncResult.count === 1 ? "" : "s"}.</p>
                  <p className="text-xs text-muted-foreground mt-1">Last sync: {format(parseISO(syncResult.at), "MMM d, HH:mm")}</p>
                </div>
              ) : null}

              {syncError ? (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Product sync failed</p>
                      <p className="text-xs text-muted-foreground mt-1">{syncError}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Recent Orders</h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Items</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Weight</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allOrders.map((order) => (
                      <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-foreground">{order.id}</td>
                        <td className="px-4 py-3 text-muted-foreground">{format(parseISO(order.createdAt), "MMM d")}</td>
                        <td className="px-4 py-3 text-muted-foreground">{order.items.length} items</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">{order.totalKg.toFixed(1)} kg</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium">€{order.totalPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <StatusBadge status={order.status} sellsyId={order.sellsyId} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <AdminClientsSection clients={clients} loading={loadingClients} error={clientError} />

          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Catalog ({products.length} products)</h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Origin</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Roast</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Price/kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingProducts ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-sm text-center text-muted-foreground">Loading catalog…</td>
                      </tr>
                    ) : products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-sm text-center text-muted-foreground">No synced products yet.</td>
                      </tr>
                    ) : (
                      products.map((product) => (
                        <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-muted-foreground">{product.sku ?? "—"}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{product.origin ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground capitalize">{product.roast_level ?? "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">€{Number(product.price_per_kg).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
