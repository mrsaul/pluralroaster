import { motion } from "framer-motion";
import { LogOut, Package, CheckCircle, Clock, RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { MOCK_PRODUCTS, MOCK_ORDERS, type Order } from "@/lib/store";
import { format, parseISO } from "date-fns";

interface AdminDashboardProps {
  orders: Order[];
  onLogout: () => void;
}

export default function AdminDashboard({ orders, onLogout }: AdminDashboardProps) {
  const allOrders = [...MOCK_ORDERS, ...orders];
  const pendingCount = allOrders.filter((o) => o.status === "pending" || o.status === "confirmed").length;
  const syncedCount = allOrders.filter((o) => o.status === "synced").length;
  const totalRevenue = allOrders.reduce((s, o) => s + o.totalPrice, 0);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
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

      {/* Main */}
      <main className="flex-1 p-4 lg:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Mobile header */}
          <div className="flex lg:hidden items-center justify-between mb-6">
            <div>
              <h1 className="text-base font-medium text-foreground">PluralRoaster</h1>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {[
              { label: "To Fulfill", value: pendingCount, icon: Clock, color: "text-primary" },
              { label: "Synced", value: syncedCount, icon: CheckCircle, color: "text-success" },
              { label: "Total Orders", value: allOrders.length, icon: Package, color: "text-foreground" },
              { label: "Revenue", value: `€${totalRevenue.toFixed(0)}`, icon: RefreshCw, color: "text-foreground" },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-2xl font-medium tabular-nums text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Orders table */}
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

          {/* Products */}
          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Catalog ({MOCK_PRODUCTS.length} products)</h2>
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
                    {MOCK_PRODUCTS.map((product) => (
                      <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-muted-foreground">{product.sku}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{product.origin}</td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{product.roastLevel}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">€{product.pricePerKg.toFixed(2)}</td>
                      </tr>
                    ))}
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
