import type { KitchenAccess } from "@/lib/landing";
import { useState } from "react";
import { useKitchenT } from "./i18n";
import CafeHome from "./cafe/CafeHome";
import CafeOrders from "./cafe/CafeOrders";
import StoresReview from "./stores/StoresReview";
import ProductionView from "./kitchen/ProductionView";
import KitchenOrdersList from "./kitchen/KitchenOrdersList";
import ProductsEditor from "./kitchen/ProductsEditor";
import KitchenSettings from "./kitchen/KitchenSettings";

// Placeholder shell — real screens per role arrive in later tasks.
export default function KitchenApp({
  access,
  onLogout,
  onSwitchToCoffee,
}: {
  access: KitchenAccess;
  onLogout: () => void;
  onSwitchToCoffee?: () => void;
}) {
  const t = useKitchenT();
  const [tab, setTab] = useState<"order" | "orders">("order");
  const [kTab, setKTab] = useState<"production" | "orders" | "products" | "settings">("production");
  if (access.role === "coffee_manager" && access.cafeId) {
    const tabs = [["order", t.cafeApp.tabOrder], ["orders", t.cafeApp.tabOrders]] as const;
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2">
            <h1 className="text-lg font-semibold">{t.title}</h1>
            <div className="flex gap-3">
              {onSwitchToCoffee && (
                <button type="button" onClick={onSwitchToCoffee} className="text-sm underline text-muted-foreground">{t.backToCoffee}</button>
              )}
              <button type="button" onClick={onLogout} className="text-sm underline text-muted-foreground">{t.logout}</button>
            </div>
          </div>
          <div role="tablist" className="mx-auto flex max-w-xl px-4">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`h-12 flex-1 border-b-2 text-sm font-medium ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
        {tab === "order" ? <CafeHome cafeId={access.cafeId} cafeName={access.cafeName} /> : <CafeOrders cafeId={access.cafeId} />}
      </div>
    );
  }
  if (access.role === "stores_manager") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2">
            <h1 className="text-lg font-semibold">{t.title}</h1>
            <div className="flex gap-3">
              {onSwitchToCoffee && (
                <button type="button" onClick={onSwitchToCoffee} className="text-sm underline text-muted-foreground">{t.backToCoffee}</button>
              )}
              <button type="button" onClick={onLogout} className="text-sm underline text-muted-foreground">{t.logout}</button>
            </div>
          </div>
        </header>
        <StoresReview />
      </div>
    );
  }
  if (access.role === "kitchen_manager") {
    const k = t.kitchen;
    const tabs = [["production", k.tabProduction], ["orders", k.tabOrders], ["products", k.tabProducts], ["settings", k.tabSettings]] as const;
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2">
            <h1 className="text-lg font-semibold">{t.title}</h1>
            <div className="flex gap-3">
              {onSwitchToCoffee && (
                <button type="button" onClick={onSwitchToCoffee} className="text-sm underline text-muted-foreground">{t.backToCoffee}</button>
              )}
              <button type="button" onClick={onLogout} className="text-sm underline text-muted-foreground">{t.logout}</button>
            </div>
          </div>
          <div role="tablist" className="mx-auto flex max-w-xl px-4">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={kTab === key}
                onClick={() => setKTab(key)}
                className={`h-12 flex-1 border-b-2 text-sm font-medium ${kTab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
        {kTab === "production" && <ProductionView />}
        {kTab === "orders" && <KitchenOrdersList />}
        {kTab === "products" && <ProductsEditor />}
        {kTab === "settings" && <KitchenSettings />}
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4 pt-16 text-center">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-sm font-medium">{t.roles[access.role]}</p>
      {access.cafeName && (
        <p className="text-sm text-muted-foreground">
          {t.cafe} : {access.cafeName}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t.placeholder}</p>
      <div className="flex gap-3">
        {onSwitchToCoffee && (
          <button type="button" onClick={onSwitchToCoffee} className="text-sm underline text-muted-foreground hover:text-foreground">
            {t.backToCoffee}
          </button>
        )}
        <button type="button" onClick={onLogout} className="text-sm underline text-muted-foreground hover:text-foreground">
          {t.logout}
        </button>
      </div>
    </div>
  );
}
