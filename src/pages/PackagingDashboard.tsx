import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PackagingView, type PackagingOrder } from "@/components/PackagingView";
import { LogOut, Package } from "lucide-react";
import { type OrderStatus, normalizeOrderStatus } from "@/lib/orderStatuses";
import { useToast } from "@/components/ui/use-toast";

interface PackagingDashboardProps {
  onLogout: () => void;
}

export default function PackagingDashboard({ onLogout }: PackagingDashboardProps) {
  const [orders, setOrders] = useState<PackagingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, user_id, company_id, client_name, delivery_date, total_kg, status, is_roasted, is_packed, is_labeled,
          order_items ( product_name, product_sku, quantity, price_per_kg, size_label, size_kg ),
          companies ( name )
        `)
        .order("delivery_date", { ascending: true });
      if (error) throw error;

      // Resolve client names:
      // 1. contacts table (via user_id) → company name or contact name
      // 2. profiles.full_name / email as fallback
      const userIds = [...new Set((data ?? []).map((o: any) => o.user_id).filter(Boolean))];

      const [{ data: contacts }, { data: profiles }] = await Promise.all([
        userIds.length > 0
          ? supabase
              .from("contacts")
              .select("user_id, first_name, last_name, companies(name)")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Pick the primary contact per user_id (first match is fine — one user = one company)
      const contactMap = new Map<string, { companyName: string | null; contactName: string | null }>();
      for (const c of (contacts ?? []) as any[]) {
        if (!c.user_id || contactMap.has(c.user_id)) continue;
        const companyName = (c.companies as any)?.name ?? null;
        const contactName = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
        contactMap.set(c.user_id, { companyName, contactName });
      }
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      setOrders(
        ((data ?? []) as any[]).map((o) => {
          const contact = o.user_id ? contactMap.get(o.user_id) : null;
          const profile = o.user_id ? profileMap.get(o.user_id) : null;
          // Resolution chain: order.company → contact.company → contact name → profile → "Client sans nom"
          const clientName =
            o.client_name                      // manual admin override
            ?? (o.companies as any)?.name       // company_id direct join on order
            ?? contact?.companyName             // company via contacts table (user_id path)
            ?? contact?.contactName             // contact first+last name
            ?? profile?.full_name              // profile fallback
            ?? profile?.email                  // email last resort
            ?? "Client sans nom";
          return {
            id: o.id,
            client_name: clientName,
            delivery_date: o.delivery_date,
            total_kg: Number(o.total_kg),
            status: normalizeOrderStatus(o.status),
            is_roasted: Boolean(o.is_roasted),
            is_packed: Boolean(o.is_packed),
            is_labeled: Boolean(o.is_labeled),
            items: (o.order_items ?? []).map((i: any) => ({
              product_name: i.product_name,
              product_sku: i.product_sku ?? null,
              quantity: Number(i.quantity),
              price_per_kg: Number(i.price_per_kg),
              size_label: i.size_label ?? null,
              size_kg: i.size_kg != null ? Number(i.size_kg) : null,
            })),
          };
        }),
      );
    } catch (err) {
      toast({ title: "Failed to load orders", description: err instanceof Error ? err.message : (err as any)?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const handleStatusChange = useCallback(async (orderId: string, newStatus: OrderStatus) => {
    try {
      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err) {
      toast({ title: "Status update failed", description: err instanceof Error ? err.message : (err as any)?.message ?? String(err), variant: "destructive" });
    }
  }, [toast]);

  const handleChecklistChange = useCallback(async (orderId: string, field: "is_roasted" | "is_packed" | "is_labeled", value: boolean) => {
    try {
      const { error } = await supabase.from("orders").update({ [field]: value } as { is_roasted?: boolean; is_packed?: boolean; is_labeled?: boolean }).eq("id", orderId);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, [field]: value } : o));
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : (err as any)?.message ?? String(err), variant: "destructive" });
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-info" />
          <h1 className="text-base font-medium text-foreground">Packaging View</h1>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </header>
      <main className="p-4 lg:p-8 max-w-6xl mx-auto">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading…</p>
        ) : (
          <PackagingView
            orders={orders}
            onStatusChange={handleStatusChange}
            onChecklistChange={handleChecklistChange}
          />
        )}
      </main>
    </div>
  );
}
