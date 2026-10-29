import type { KitchenAccess } from "@/lib/landing";
import { useState } from "react";
import { Flame, ListOrdered, Package, Settings, ShoppingBasket } from "lucide-react";
import { useKitchenT } from "./i18n";
import CafeHome from "./cafe/CafeHome";
import CafeOrders from "./cafe/CafeOrders";
import StoresReview from "./stores/StoresReview";
import ProductionView from "./kitchen/ProductionView";
import KitchenOrdersList from "./kitchen/KitchenOrdersList";
import ProductsEditor from "./kitchen/ProductsEditor";
import KitchenSettings from "./kitchen/KitchenSettings";
import NotificationsToggle from "./components/NotificationsToggle";
import CuisineShell, { type ShellTab } from "./ui/CuisineShell";
import { useCuisineTheme } from "./ui/useCuisineTheme";

type KitchenTab = "production" | "orders" | "products" | "settings";
type CafeTab = "order" | "orders";

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
  const [tab, setTab] = useState<CafeTab>("order");
  const [kTab, setKTab] = useState<KitchenTab>("production");
  const shared = {
    roleLabel: t.roles[access.role],
    cafeName: access.cafeName,
    notifications: <NotificationsToggle />,
    onSwitchToCoffee,
    onLogout,
    strings: { menu: t.menu, closeMenu: t.closeMenu, account: t.account, nav: t.nav, backToCoffee: t.backToCoffee, logout: t.logout },
  };

  if (access.role === "coffee_manager" && access.cafeId) {
    const tabs: ShellTab[] = [
      { key: "order", label: t.cafeApp.tabOrder, icon: ShoppingBasket },
      { key: "orders", label: t.cafeApp.tabOrders, icon: ListOrdered },
    ];
    return (
      <CuisineShell
        {...shared}
        title={tabs.find((x) => x.key === tab)?.label ?? t.title}
        tabs={tabs}
        activeTab={tab}
        onTabChange={(key) => setTab(key as CafeTab)}
      >
        {tab === "order" ? <CafeHome cafeId={access.cafeId} cafeName={access.cafeName} /> : <CafeOrders cafeId={access.cafeId} />}
      </CuisineShell>
    );
  }
  if (access.role === "stores_manager") {
    return (
      <CuisineShell {...shared} title={t.stores.title} tabs={[]}>
        <StoresReview />
      </CuisineShell>
    );
  }
  if (access.role === "kitchen_manager") {
    const k = t.kitchen;
    const tabs: ShellTab[] = [
      { key: "production", label: k.tabProduction, icon: Flame },
      { key: "orders", label: k.tabOrders, icon: ListOrdered },
      { key: "products", label: k.tabProducts, icon: Package },
      { key: "settings", label: k.tabSettings, icon: Settings },
    ];
    return (
      <CuisineShell
        {...shared}
        title={tabs.find((x) => x.key === kTab)?.label ?? t.title}
        tabs={tabs}
        activeTab={kTab}
        onTabChange={(key) => setKTab(key as KitchenTab)}
      >
        {kTab === "production" && <ProductionView />}
        {kTab === "orders" && <KitchenOrdersList />}
        {kTab === "products" && <ProductsEditor />}
        {kTab === "settings" && <KitchenSettings />}
      </CuisineShell>
    );
  }
  return <PlaceholderRole access={access} onLogout={onLogout} onSwitchToCoffee={onSwitchToCoffee} />;
}

// Unknown role: keep the centred placeholder, inside the Cuisine theme.
function PlaceholderRole({ access, onLogout, onSwitchToCoffee }: { access: KitchenAccess; onLogout: () => void; onSwitchToCoffee?: () => void }) {
  const t = useKitchenT();
  useCuisineTheme();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-4 pt-16 text-center">
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
