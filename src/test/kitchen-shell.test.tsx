import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ClipboardList, Factory, Package } from "lucide-react";
import CuisineShell, { type MenuStrings, type ShellTab } from "@/kitchen/ui/CuisineShell";
import { Button } from "@/components/ui/button";
import KitchenApp from "@/kitchen/KitchenApp";
import type { KitchenAccess } from "@/lib/landing";

vi.mock("@/kitchen/kitchen/ProductionView", () => ({ default: () => <p>PRODUCTION</p> }));
vi.mock("@/kitchen/kitchen/KitchenOrdersList", () => ({ default: () => <p>KORDERS</p> }));
vi.mock("@/kitchen/kitchen/ProductsEditor", () => ({ default: () => <p>PRODUCTS</p> }));
vi.mock("@/kitchen/kitchen/KitchenSettings", () => ({ default: () => <p>SETTINGS</p> }));
vi.mock("@/kitchen/cafe/CafeHome", () => ({ default: () => <p>CAFEHOME</p> }));
vi.mock("@/kitchen/cafe/CafeOrders", () => ({ default: () => <p>CAFEORDERS</p> }));
vi.mock("@/kitchen/stores/StoresReview", () => ({ default: () => <p>STORES</p> }));
vi.mock("@/kitchen/components/NotificationsToggle", () => ({ default: () => <button type="button">Notifs</button> }));

const motionPrefs = vi.hoisted(() => ({ reduce: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motionPrefs.reduce,
}));

const STRINGS: MenuStrings = {
  menu: "Menu",
  closeMenu: "Fermer le menu",
  account: "Compte",
  nav: "Navigation",
  backToCoffee: "Retour au café",
  logout: "Se déconnecter",
};

const TABS: ShellTab[] = [
  { key: "production", label: "Production", icon: Factory },
  { key: "orders", label: "Commandes", icon: ClipboardList },
  { key: "products", label: "Produits", icon: Package },
];

function renderShell(over: Partial<Parameters<typeof CuisineShell>[0]> = {}) {
  const onTabChange = vi.fn();
  const onLogout = vi.fn();
  render(
    <CuisineShell
      title="Production"
      tabs={TABS}
      activeTab="production"
      onTabChange={onTabChange}
      roleLabel="Responsable cuisine"
      cafeName="Plural Café"
      onLogout={onLogout}
      strings={STRINGS}
      {...over}
    >
      <p>Contenu</p>
    </CuisineShell>,
  );
  return { onTabChange, onLogout };
}

afterEach(() => {
  motionPrefs.reduce = false;
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

describe("CuisineShell", () => {
  it("renders the large title and the content", () => {
    renderShell();
    expect(screen.getByRole("heading", { level: 1, name: "Production" })).toBeInTheDocument();
    expect(screen.getByText("Contenu")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
  });

  it("marks the active tab and switches on click", () => {
    const { onTabChange } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Commandes" }));
    expect(onTabChange).toHaveBeenCalledWith("orders");
    expect(screen.getByRole("button", { name: "Production" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Commandes" })).not.toHaveAttribute("aria-current");
  });

  it("opens the black menu and closes it with Escape, returning focus", async () => {
    renderShell();
    const menuBtn = screen.getByRole("button", { name: "Menu" });
    expect(menuBtn).toHaveAttribute("aria-haspopup", "dialog");
    expect(menuBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menuBtn);
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(menuBtn).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText("Responsable cuisine")).toBeInTheDocument();
    expect(within(dialog).getByText("Plural Café")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Production" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull());
    expect(menuBtn).toHaveFocus();
  });

  it("closes the menu with the close button", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer le menu" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull());
  });

  it("ignores an Escape another overlay already handled", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
  });

  it("shows Retour au café only when switching is allowed", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.queryByRole("button", { name: "Retour au café" })).toBeNull();
  });

  it("switches back to the coffee space from the menu", () => {
    const onSwitchToCoffee = vi.fn();
    renderShell({ onSwitchToCoffee });
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Retour au café" }));
    expect(onSwitchToCoffee).toHaveBeenCalled();
  });

  it("logs out from the menu", () => {
    const { onLogout } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(onLogout).toHaveBeenCalled();
  });

  it("shows the account group with notifications", () => {
    renderShell({ notifications: <button type="button">Notifications</button> });
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(within(dialog).getByText("Compte")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("choosing a tab in the menu switches and closes it", async () => {
    const { onTabChange } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(within(dialog).getByRole("button", { name: "Production" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(dialog).getByRole("button", { name: "Produits" }));
    expect(onTabChange).toHaveBeenCalledWith("products");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull());
  });

  it("works with no tabs and a floating action", () => {
    renderShell({ tabs: [], activeTab: undefined, floatingAction: <button type="button">Nouvelle commande urgente</button> });
    const nav = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(nav).getByRole("button", { name: "Nouvelle commande urgente" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("renders top actions in the header", () => {
    renderShell({ topActions: <button type="button" aria-label="Partager" /> });
    expect(screen.getByRole("button", { name: "Partager" })).toBeInTheDocument();
  });

  it("pads content so the last row clears the tab bar", () => {
    renderShell();
    expect(screen.getByTestId("cuisine-content").className).toMatch(/pb-\[calc\(env\(safe-area-inset-bottom\)\+7rem\)\]/);
  });

  it("shows the compact title after scrolling", () => {
    renderShell();
    expect(screen.getByTestId("compact-title")).toHaveAttribute("data-compact", "false");
    Object.defineProperty(window, "scrollY", { value: 120, configurable: true });
    fireEvent.scroll(window);
    expect(screen.getByTestId("compact-title")).toHaveAttribute("data-compact", "true");
  });

  it("applies the Cuisine theme while mounted", () => {
    renderShell();
    expect(document.documentElement).toHaveClass("theme-cuisine");
  });

  it("makes the background inert while the menu is open", async () => {
    renderShell();
    const background = screen.getByTestId("cuisine-background");
    expect(background).toContainElement(screen.getByTestId("cuisine-content"));
    expect(background).toContainElement(screen.getByRole("navigation", { name: "Navigation" }));
    expect(background).not.toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(background).toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background).not.toContainElement(screen.getByRole("dialog", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer le menu" }));
    expect(background).not.toHaveAttribute("inert");
    expect(background).not.toHaveAttribute("aria-hidden");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull());
  });

  it("fades the menu in by default", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" }).style.opacity).toBe("0");
  });

  it("shows and hides the menu instantly under reduced motion", async () => {
    motionPrefs.reduce = true;
    renderShell();
    expect(screen.getByTestId("cuisine-content").style.opacity).not.toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog.style.opacity).not.toBe("0");
    expect(dialog.style.transform).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Fermer le menu" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull());
  });

  it("re-skins slotted notification buttons for the black menu", () => {
    renderShell({ notifications: <Button variant="ghost" aria-label="Activer les notifications" /> });
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const wrapper = screen.getByTestId("menu-notifications");
    expect(wrapper).toContainElement(screen.getByRole("button", { name: "Activer les notifications" }));
    for (const cls of ["[&_button]:text-brand-paper", "[&_button:hover]:bg-brand-night-2", "[&_button:focus-visible]:bg-brand-night-2"]) {
      expect(wrapper).toHaveClass(cls);
    }
  });
});

describe("KitchenApp wiring", () => {
  const access = (role: KitchenAccess["role"]) => ({ role, cafeId: "c1", cafeName: "Plural Café" }) as KitchenAccess;

  it("kitchen manager sees four tabs and Production first", () => {
    render(<KitchenApp access={access("kitchen_manager")} onLogout={vi.fn()} />);
    for (const n of ["Production", "Commandes", "Produits", "Réglages"]) expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Production" })).toBeInTheDocument();
    expect(screen.getByText("PRODUCTION")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Produits" }));
    expect(screen.getByText("PRODUCTS")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Produits" })).toBeInTheDocument();
  });

  it("café manager has Commander and Mes commandes", () => {
    render(<KitchenApp access={access("coffee_manager")} onLogout={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Commander" })).toBeInTheDocument();
    expect(screen.getByText("CAFEHOME")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mes commandes" }));
    expect(screen.getByText("CAFEORDERS")).toBeInTheDocument();
  });

  it("stores manager gets the Commandes des cafés title and no tabs", () => {
    render(<KitchenApp access={access("stores_manager")} onLogout={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Commandes des cafés" })).toBeInTheDocument();
    expect(screen.getByText("STORES")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Production" })).toBeNull();
  });

  it("menu shows the role label, back-to-coffee and logout", () => {
    const onLogout = vi.fn();
    const onSwitch = vi.fn();
    render(<KitchenApp access={access("kitchen_manager")} onLogout={onLogout} onSwitchToCoffee={onSwitch} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = within(screen.getByRole("dialog", { name: "Menu" }));
    expect(menu.getByText("Responsable cuisine")).toBeInTheDocument();
    fireEvent.click(menu.getByRole("button", { name: "Se déconnecter" }));
    expect(onLogout).toHaveBeenCalled();
  });

  it("unknown role keeps the placeholder", () => {
    render(<KitchenApp access={{ role: "other", cafeId: null, cafeName: null } as unknown as KitchenAccess} onLogout={vi.fn()} />);
    expect(screen.getByText("L'espace Cuisine arrive bientôt.")).toBeInTheDocument();
  });
});
