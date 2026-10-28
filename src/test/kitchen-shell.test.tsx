import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ClipboardList, Factory, Package } from "lucide-react";
import CuisineShell, { type MenuStrings, type ShellTab } from "@/kitchen/ui/CuisineShell";

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
});
