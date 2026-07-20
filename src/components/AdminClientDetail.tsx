import { useState, useEffect } from "react";
import { Link2, Unlink2, AlertTriangle, Loader2, Clock, RefreshCw, ChevronDown, ChevronRight, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { DraftBanner } from "@/components/DraftBanner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, parseISO } from "date-fns";

export type AppClient = {
  id: string;
  user_id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  delivery_address: string | null;
  pricing_tier: string | null;
  pricing_tier_id: string | null;
  sellsy_client_id: string | null;
  onboarding_status: string | null;
  client_data_mode: "sellsy" | "custom";
  custom_company_name: string | null;
  custom_contact_name: string | null;
  custom_email: string | null;
  custom_phone: string | null;
  custom_delivery_address: string | null;
  custom_pricing_tier: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type PricingTierOption = {
  id: string;
  name: string;
  product_discount_percent: number;
  delivery_discount_percent: number;
};

type ClientOrderItem = {
  id: string;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  price_per_kg: number;
  size_label: string | null;
};

type ClientOrder = {
  id: string;
  created_at: string;
  delivery_date: string | null;
  status: string;
  total_kg: number;
  total_price: number;
  sellsy_id: string | null;
  items: ClientOrderItem[];
};

interface Props {
  client: AppClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// ── Draft-persisted form data ─────────────────────────────────────────────────
type ClientEditFormData = {
  dataMode: "sellsy" | "custom";
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  deliveryAddress: string;
  pricingTier: string;
  pricingTierId: string | null;
};

function clientToFormData(client: AppClient): ClientEditFormData {
  return {
    dataMode: client.client_data_mode ?? "custom",
    companyName: client.custom_company_name ?? client.company_name ?? "",
    contactName: client.custom_contact_name ?? client.contact_name ?? "",
    email: client.custom_email ?? client.email ?? "",
    phone: client.custom_phone ?? client.phone ?? "",
    deliveryAddress: client.custom_delivery_address ?? client.delivery_address ?? "",
    pricingTier: client.custom_pricing_tier ?? client.pricing_tier ?? "standard",
    pricingTierId: client.pricing_tier_id ?? null,
  };
}

export function AdminClientDetail({ client, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();

  // Transient UI state — not persisted
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<"sellsy" | "custom" | null>(null);
  const [tierOptions, setTierOptions] = useState<PricingTierOption[]>([]);
  const [pendingTierChange, setPendingTierChange] = useState<string | null>(null);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [sellsyClientId, setSellsyClientId] = useState<string>(client?.sellsy_client_id ?? "");

  // ── Draft-persisted form state (key includes client id for per-client drafts) ──
  const defaultFormData = client ? clientToFormData(client) : {
    dataMode: "custom" as const, companyName: "", contactName: "", email: "",
    phone: "", deliveryAddress: "", pricingTier: "standard", pricingTierId: null,
  };

  const {
    value: form,
    setValue: setForm,
    clearDraft,
    discardDraft,
    savedAt: draftSavedAt,
    showBanner: showDraftBanner,
  } = useDraftPersistence<ClientEditFormData>(
    `admin-client-edit:${client?.id ?? "none"}`,
    defaultFormData,
  );

  const { dataMode, companyName, contactName, email, phone, deliveryAddress, pricingTier, pricingTierId } = form;

  // Field-specific setters
  const setDataMode = (v: "sellsy" | "custom") => setForm(p => ({ ...p, dataMode: v }));
  const setCompanyName = (v: string) => setForm(p => ({ ...p, companyName: v }));
  const setContactName = (v: string) => setForm(p => ({ ...p, contactName: v }));
  const setEmail = (v: string) => setForm(p => ({ ...p, email: v }));
  const setPhone = (v: string) => setForm(p => ({ ...p, phone: v }));
  const setDeliveryAddress = (v: string) => setForm(p => ({ ...p, deliveryAddress: v }));
  const setPricingTier = (v: string) => setForm(p => ({ ...p, pricingTier: v }));
  const setPricingTierId = (v: string | null) => setForm(p => ({ ...p, pricingTierId: v }));

  useEffect(() => {
    if (!open) return;
    setSellsyClientId(client?.sellsy_client_id ?? "");
    supabase.from("pricing_tiers").select("id, name, product_discount_percent, delivery_discount_percent").eq("is_active", true).order("name")
      .then(({ data }) => setTierOptions((data ?? []) as PricingTierOption[]));
  }, [open, client?.id]);

  useEffect(() => {
    if (!open || !client) return;
    setLoadingOrders(true);
    setExpandedOrderId(null);
    supabase
      .from("orders")
      .select("id, created_at, delivery_date, status, total_kg, total_price, sellsy_id, order_items(id, product_name, product_sku, quantity, price_per_kg, size_label)")
      .eq("company_id", client.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(
          (data ?? []).map((o: any) => ({
            id: o.id,
            created_at: o.created_at,
            delivery_date: o.delivery_date ?? null,
            status: o.status ?? "pending",
            total_kg: Number(o.total_kg),
            total_price: Number(o.total_price),
            sellsy_id: o.sellsy_id ?? null,
            items: (o.order_items ?? []).map((i: any) => ({
              id: i.id,
              product_name: i.product_name,
              product_sku: i.product_sku ?? null,
              quantity: Number(i.quantity),
              price_per_kg: Number(i.price_per_kg),
              size_label: i.size_label ?? null,
            })),
          }))
        );
        setLoadingOrders(false);
      });
  }, [open, client?.id]);

  const isSellsyMode = dataMode === "sellsy";

  const handleModeSwitch = (newMode: "sellsy" | "custom") => {
    if (newMode === dataMode) return;
    setPendingModeSwitch(newMode);
  };

  const confirmModeSwitch = () => {
    if (!pendingModeSwitch || !client) return;
    if (pendingModeSwitch === "custom") {
      setForm(p => ({
        ...p,
        dataMode: "custom",
        companyName: client.company_name ?? "",
        contactName: client.contact_name ?? "",
        email: client.email ?? "",
        phone: client.phone ?? "",
        deliveryAddress: client.delivery_address ?? "",
        pricingTier: client.pricing_tier ?? "standard",
      }));
    }
    if (pendingModeSwitch === "sellsy") {
      setForm(p => ({
        ...p,
        dataMode: "sellsy",
        companyName: "", contactName: "", email: "",
        phone: "", deliveryAddress: "", pricingTier: "",
      }));
    }
    setPendingModeSwitch(null);
  };

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);
    try {
      // Update company core fields
      const { error: companyErr } = await supabase
        .from("companies")
        .update({
          client_data_mode: dataMode,
          name: dataMode === "custom" ? (companyName || client.company_name) : client.company_name,
          email: email || null,
          phone: phone || null,
          pricing_tier_id: pricingTierId,
          sellsy_client_id: sellsyClientId.trim() || null,
        })
        .eq("id", client.id);
      if (companyErr) throw companyErr;

      // Update primary contact name / email / phone
      if (dataMode === "custom") {
        await supabase
          .from("contacts")
          .update({
            last_name: contactName || null,
            email: email || null,
            phone: phone || null,
          })
          .eq("company_id", client.id)
          .eq("is_primary", true);
      }

      // Upsert delivery address
      if (deliveryAddress) {
        const { data: existingAddr } = await supabase
          .from("company_addresses")
          .select("id")
          .eq("company_id", client.id)
          .eq("label", "Delivery")
          .maybeSingle();

        if (existingAddr) {
          await supabase.from("company_addresses")
            .update({ address_line1: deliveryAddress })
            .eq("id", existingAddr.id);
        } else {
          await supabase.from("company_addresses").insert({
            company_id: client.id,
            label: "Delivery",
            address_line1: deliveryAddress,
          });
        }
      }

      clearDraft();
      toast({ title: "Client updated" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  const resolvedCompany = isSellsyMode ? (client.company_name ?? "—") : (companyName || (client.company_name ?? "—"));
  const resolvedContact = isSellsyMode ? (client.contact_name ?? "—") : (contactName || (client.contact_name ?? "—"));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {resolvedCompany}
              <Badge
                variant={client.onboarding_status === "completed" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {client.onboarding_status === "completed" ? "Active" : "Pending"}
              </Badge>
            </DialogTitle>
            <DialogDescription>Manage client profile and data source.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {showDraftBanner && draftSavedAt && (
              <DraftBanner savedAt={draftSavedAt} onDiscard={discardDraft} />
            )}
            {/* Data Source Mode */}
            <div className="rounded-xl border-2 border-border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Client Data Source</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeSwitch("sellsy")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                    isSellsyMode
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Link2 className={cn("h-4 w-4 shrink-0", isSellsyMode ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <p className={cn("text-sm font-medium", isSellsyMode ? "text-primary" : "text-foreground")}>Sync with Sellsy</p>
                    <p className="text-[11px] text-muted-foreground">Read-only data</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch("custom")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                    !isSellsyMode
                      ? "border-accent-foreground bg-accent/50"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Unlink2 className={cn("h-4 w-4 shrink-0", !isSellsyMode ? "text-accent-foreground" : "text-muted-foreground")} />
                  <div>
                    <p className={cn("text-sm font-medium", !isSellsyMode ? "text-accent-foreground" : "text-foreground")}>Custom Override</p>
                    <p className="text-[11px] text-muted-foreground">Edit in app</p>
                  </div>
                </button>
              </div>

              {isSellsyMode ? (
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs text-primary font-medium">Synced with Sellsy — contact & delivery fields are read-only</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-accent/30 border border-accent px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-accent-foreground" />
                  <p className="text-xs text-accent-foreground font-medium">Custom override — changes apply only inside the app</p>
                </div>
              )}
            </div>

            {/* Sellsy Client ID — editable */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Sellsy Client ID (for invoicing)</p>
              <Input
                value={sellsyClientId}
                onChange={(e) => setSellsyClientId(e.target.value)}
                placeholder="e.g. 123456"
                className="font-mono text-sm"
              />
              {!sellsyClientId.trim() && (
                <p className="text-[11px] text-warning flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Without a Sellsy ID, invoices can't be sent for this client.
                </p>
              )}
            </div>

            {/* Editable / Read-only fields */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Company Name</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm font-medium text-foreground">{client.company_name ?? "—"}</p>
                  </div>
                ) : (
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Contact Name</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground">{client.contact_name ?? "—"}</p>
                  </div>
                ) : (
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Email</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground">{client.email ?? "—"}</p>
                  </div>
                ) : (
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Phone</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground">{client.phone ?? "—"}</p>
                  </div>
                ) : (
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" />
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Delivery Address</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground">{client.delivery_address ?? "—"}</p>
                  </div>
                ) : (
                  <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Full delivery address" />
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Pricing Tier</p>
                {tierOptions.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setPricingTierId(null); setPricingTier("standard"); }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          !pricingTierId
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                        )}
                      >
                        No tier (standard)
                      </button>
                      {tierOptions.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (pricingTierId && pricingTierId !== t.id) {
                              setPendingTierChange(t.id);
                            } else {
                              setPricingTierId(t.id);
                              setPricingTier(t.name);
                            }
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            pricingTierId === t.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                          )}
                        >
                          {t.name}
                          {t.product_discount_percent > 0 && ` (${t.product_discount_percent}%)`}
                        </button>
                      ))}
                    </div>
                    {pricingTierId && (() => {
                      const sel = tierOptions.find((t) => t.id === pricingTierId);
                      if (!sel) return null;
                      return (
                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          {sel.product_discount_percent > 0 && <span>{sel.product_discount_percent}% off products</span>}
                          {sel.product_discount_percent > 0 && sel.delivery_discount_percent > 0 && <span> · </span>}
                          {sel.delivery_discount_percent > 0 && (
                            <span>{sel.delivery_discount_percent === 100 ? "Free delivery" : `${sel.delivery_discount_percent}% off delivery`}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No pricing tiers created yet. Create tiers in the Pricing section.</p>
                )}
              </div>
            </div>

            {/* Sync from Sellsy */}
            {client.sellsy_client_id && (
              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {client.last_synced_at
                    ? `Last synced: ${format(parseISO(client.last_synced_at), "MMM d, yyyy HH:mm")}`
                    : "Never synced with Sellsy"}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncing}
                  className="gap-1.5 text-xs h-7"
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("sellsy-sync", {
                        body: { mode: "sync-client", sellsy_client_id: client.sellsy_client_id, client_id: client.id },
                      });
                      if (error) throw error;
                      if (!data?.success) throw new Error(data?.error ?? "Sync failed");
                      toast({ title: "Client synced from Sellsy" });
                      onSaved();
                    } catch (err) {
                      toast({ title: "Sync failed", description: String(err), variant: "destructive" });
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Sync from Sellsy
                </Button>
              </div>
            )}

            {/* Onboarding info */}
            <div className="rounded-lg bg-muted/30 border border-dashed border-border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                Registered: {format(parseISO(client.created_at), "MMM d, yyyy")} · Status: <span className="capitalize font-medium">{client.onboarding_status ?? "pending"}</span>
              </p>
            </div>

            {/* Order History */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Order History</p>
                {loadingOrders && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {!loadingOrders && orders.length === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  <Package className="h-4 w-4 shrink-0" />
                  No orders yet for this client.
                </div>
              )}
              {orders.length > 0 && (
                <div className="space-y-1.5">
                  {orders.map((order) => {
                    const isExpanded = expandedOrderId === order.id;
                    const statusColor =
                      order.status === "confirmed" ? "bg-blue-100 text-blue-700 border-blue-200" :
                      order.status === "received" ? "bg-green-100 text-green-700 border-green-200" :
                      order.status === "cancelled" ? "bg-red-100 text-red-700 border-red-200" :
                      "bg-muted text-muted-foreground border-border";
                    return (
                      <div key={order.id} className="rounded-lg border border-border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          <span className="flex-1 text-xs text-muted-foreground tabular-nums">
                            {format(parseISO(order.created_at), "d MMM yyyy")}
                            {order.delivery_date && (
                              <span className="ml-1.5">→ {format(parseISO(order.delivery_date), "d MMM")}</span>
                            )}
                          </span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", statusColor)}>
                            {order.status}
                          </span>
                          <span className="text-xs font-medium tabular-nums text-muted-foreground ml-2">
                            {order.total_kg} kg
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-foreground ml-2">
                            €{order.total_price.toFixed(2)}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-1">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-foreground font-medium truncate">{item.product_name}</span>
                                <span className="shrink-0 text-muted-foreground tabular-nums">
                                  {item.quantity} kg{item.size_label ? ` · ${item.size_label}` : ""}
                                  {" · "}€{item.price_per_kg.toFixed(2)}/kg
                                </span>
                              </div>
                            ))}
                            {order.sellsy_id && (
                              <p className="text-[10px] text-muted-foreground/60 pt-1">Sellsy #{order.sellsy_id}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Save */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mode switch confirmation */}
      <AlertDialog open={!!pendingModeSwitch} onOpenChange={(open) => !open && setPendingModeSwitch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {pendingModeSwitch === "custom" ? "Switch to Custom Override?" : "Switch to Sellsy Sync?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingModeSwitch === "custom"
                ? "You will override Sellsy data. Changes will apply only inside the app. Sellsy invoicing data remains unchanged."
                : "App overrides to contact info, delivery address, and pricing will be lost and replaced by Sellsy data."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeSwitch}>
              {pendingModeSwitch === "custom" ? "Use Custom Override" : "Restore Sellsy Sync"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tier change warning */}
      <AlertDialog open={!!pendingTierChange} onOpenChange={(v) => !v && setPendingTierChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Change pricing tier?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will affect all future orders for this client. Existing orders will not be recalculated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingTierChange) {
                const tier = tierOptions.find((t) => t.id === pendingTierChange);
                setForm(p => ({
                  ...p,
                  pricingTierId: pendingTierChange,
                  pricingTier: tier?.name ?? p.pricingTier,
                }));
              }
              setPendingTierChange(null);
            }}>
              Change Tier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
