import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  House,
  ShoppingBag,
  UserCircle2,
  LogOut,
  ClipboardList,
  MapPin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OrderHistoryTab } from "@/components/OrderHistoryTab";
import { OrderDetailView } from "@/components/OrderDetailView";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountPageProps {
  orders: Order[];
  onGoHome: () => void;
  onGoShop: () => void;
  onGoAccount: () => void;
  onLogout: () => void;
  onReorder: (order: Order) => void;
}

type Tab = "orders" | "profile" | "addresses";

interface CompanyProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
  legalName: string | null;
  siret: string | null;
  vatNumber: string | null;
}

interface Address {
  id: string;
  label: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-border last:border-0">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-foreground">{value || "—"}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccountPage({
  orders,
  onGoHome,
  onGoShop,
  onGoAccount,
  onLogout,
  onReorder,
}: AccountPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  // Load company profile from contacts → companies
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingProfile(true);
      const [{ data: userData }, { data: contact }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("contacts")
          .select("id, company_id, companies(name, email, phone, legal_company_name, siret, vat_number)")
          .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setUserEmail(userData.user?.email ?? null);

      const company = (contact?.companies as any) ?? null;
      if (company) {
        setProfile({
          name: company.name,
          email: company.email,
          phone: company.phone,
          legalName: company.legal_company_name,
          siret: company.siret,
          vatNumber: company.vat_number,
        });
      }
      setLoadingProfile(false);
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  // Load addresses when the addresses tab is first opened
  useEffect(() => {
    if (activeTab !== "addresses" || addresses.length > 0) return;

    let cancelled = false;
    const load = async () => {
      setLoadingAddresses(true);
      const { data: contact } = await supabase
        .from("contacts")
        .select("company_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();

      if (!contact?.company_id || cancelled) {
        setLoadingAddresses(false);
        return;
      }

      const { data } = await supabase
        .from("company_addresses")
        .select("id, label, address_line1, address_line2, postal_code, city, country_code")
        .eq("company_id", contact.company_id);

      if (cancelled) return;

      setAddresses(
        (data ?? []).map((a: any) => ({
          id: a.id,
          label: a.label,
          addressLine1: a.address_line1,
          addressLine2: a.address_line2,
          postalCode: a.postal_code,
          city: a.city,
          country: a.country_code,
        }))
      );
      setLoadingAddresses(false);
    };

    void load();
    return () => { cancelled = true; };
  }, [activeTab, addresses.length]);

  // ── Order detail view ─────────────────────────────────────────────────────

  if (selectedOrder) {
    return (
      <OrderDetailView
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onReorder={(order) => {
          setSelectedOrder(null);
          onReorder(order);
        }}
      />
    );
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "orders",    label: "Commandes", icon: ClipboardList },
    { id: "profile",   label: "Profil",    icon: UserCircle2 },
    { id: "addresses", label: "Adresses",  icon: MapPin },
  ];

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 pt-[max(20px,calc(env(safe-area-inset-top)+16px))] pb-0">
        <div className="max-w-lg mx-auto">
          {/* Title row */}
          <div className="flex items-center justify-between pb-3">
            <div>
              {loadingProfile ? (
                <>
                  <div className="h-3.5 w-32 rounded bg-muted animate-pulse mb-1" />
                  <div className="h-3 w-40 rounded bg-muted animate-pulse" />
                </>
              ) : (
                <>
                  <h1 className="text-base font-semibold text-foreground">
                    {profile?.name ?? "Mon compte"}
                  </h1>
                  <p className="text-xs text-muted-foreground">{userEmail ?? ""}</p>
                </>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
                  activeTab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-lg mx-auto px-4 pt-5 pb-36">

        {/* Commandes tab */}
        {activeTab === "orders" && (
          <motion.div
            key="orders"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <OrderHistoryTab
              orders={orders}
              onViewDetail={setSelectedOrder}
              onReorder={onReorder}
            />
          </motion.div>
        )}

        {/* Profil tab */}
        {activeTab === "profile" && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <section className="rounded-2xl border border-border bg-card px-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-3 pb-1">
                Entreprise
              </p>
              {loadingProfile ? (
                <div className="py-4 space-y-3 animate-pulse">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-4 w-full rounded bg-muted" />
                  ))}
                </div>
              ) : (
                <>
                  <ProfileField label="Nom commercial" value={profile?.name} />
                  <ProfileField label="Raison sociale" value={profile?.legalName} />
                  <ProfileField label="SIRET" value={profile?.siret} />
                  <ProfileField label="N° TVA" value={profile?.vatNumber} />
                </>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card px-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-3 pb-1">
                Contact
              </p>
              {loadingProfile ? (
                <div className="py-4 space-y-3 animate-pulse">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-4 w-full rounded bg-muted" />
                  ))}
                </div>
              ) : (
                <>
                  <ProfileField label="Email" value={profile?.email ?? userEmail} />
                  <ProfileField label="Téléphone" value={profile?.phone} />
                </>
              )}
            </section>

            <p className="text-xs text-muted-foreground text-center pb-2">
              Pour modifier ces informations, contactez votre chargé de compte.
            </p>
          </motion.div>
        )}

        {/* Adresses tab */}
        {activeTab === "addresses" && (
          <motion.div
            key="addresses"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            {loadingAddresses ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-2 animate-pulse">
                    <div className="h-3 w-20 rounded bg-muted" />
                    <div className="h-4 w-48 rounded bg-muted" />
                    <div className="h-3 w-32 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : addresses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="p-4 rounded-full bg-muted">
                  <MapPin className="h-7 w-7 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Aucune adresse</p>
                  <p className="text-sm text-muted-foreground">
                    Vos adresses de livraison apparaîtront ici.
                  </p>
                </div>
              </div>
            ) : (
              addresses.map((addr) => (
                <div
                  key={addr.id}
                  className="rounded-2xl border border-border bg-card p-4 space-y-1"
                >
                  {addr.label && (
                    <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full mb-1">
                      {addr.label}
                    </span>
                  )}
                  {addr.addressLine1 && (
                    <p className="text-sm text-foreground">{addr.addressLine1}</p>
                  )}
                  {addr.addressLine2 && (
                    <p className="text-sm text-muted-foreground">{addr.addressLine2}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {[addr.postalCode, addr.city].filter(Boolean).join(" ")}
                    {addr.country ? ` · ${addr.country}` : ""}
                  </p>
                </div>
              ))
            )}

            <p className="text-xs text-muted-foreground text-center pb-2">
              Pour modifier vos adresses, contactez votre chargé de compte.
            </p>
          </motion.div>
        )}

        {/* Sign out */}
        <div className="pt-6">
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/20 hover:text-destructive hover:bg-destructive/5"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </Button>
        </div>
      </main>

      {/* ── Bottom Navigation ── */}
      <div className="fixed inset-x-0 bottom-4 z-50 px-4 pointer-events-none">
        <div className="max-w-lg mx-auto flex items-center justify-between rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur-lg supports-[backdrop-filter]:bg-card/85 pointer-events-auto">
          {(
            [
              { label: "Accueil", icon: House,       onClick: onGoHome,    active: false },
              { label: "Boutique", icon: ShoppingBag, onClick: onGoShop,    active: false },
              { label: "Compte",  icon: UserCircle2, onClick: onGoAccount, active: true  },
            ] as const
          ).map(({ label, icon: Icon, onClick, active }) => (
            <button
              key={label}
              onClick={onClick}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
