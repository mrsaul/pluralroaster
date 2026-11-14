import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { StockListItem } from "@/services/stock";

// ── Data stubs ────────────────────────────────────────────────────────────────
const tiers = [
  { id: "t1", name: "100 kilos", description: "Gros volumes", product_discount_percent: 10, delivery_discount_percent: 0, is_active: true },
  { id: "t2", name: "30 kilos", description: null, product_discount_percent: 5, delivery_discount_percent: 100, is_active: false },
];
const users = [
  { userId: "u1", email: "camille@amulette.example", fullName: "Camille Dupont", role: "user", status: "active",
    invitedAt: null, lastSignIn: "2026-11-10T09:00:00Z", kitchenRole: null, cafeId: null, cafeName: null },
];
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => prop === "then"
      ? (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tiers, error: null }).then(resolve)
      : () => chain,
  });
  return {
    supabase: {
      from: () => chain,
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      functions: {
        invoke: vi.fn(async (_name: string, { body }: { body: { action: string } }) =>
          body.action === "list"
            ? { data: { success: true, users }, error: null }
            : { data: { success: true, cafes: [] }, error: null }),
      },
    },
  };
});

const stock: StockListItem[] = [
  { id: "s1", product_id: "p1", quantity_kg: 3.5, low_stock_threshold_kg: 5, last_updated_by: null,
    last_updated_at: "2026-11-10T09:00:00Z", created_at: null, product_name: "Colombie SANTA BARBARA — Filtre", updater_name: "Saul", is_low: true },
  { id: null, product_id: "p2", quantity_kg: null, low_stock_threshold_kg: null, last_updated_by: null,
    last_updated_at: null, created_at: null, product_name: "Brésil", updater_name: null, is_low: false },
];
vi.mock("@/hooks/useStock", () => ({
  useStockList: () => ({ data: stock, isLoading: false }),
  useUpdateStock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useStockHistory: () => ({ data: [], isLoading: false }),
  useInitStock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import { AdminProductsList, type ProductListItem } from "@/components/AdminProductsList";
import { PricingTiersView } from "@/components/PricingTiersView";
import { StockView } from "@/components/StockView";
import { UserManagementView } from "@/components/UserManagementView";

function withQuery(ui: React.ReactElement) {
  return <MemoryRouter><QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider></MemoryRouter>;
}

/** Phones get a card list; the table only shows from the md breakpoint up. */
function expectPhoneCardsAndWideTable(list: HTMLElement) {
  expect(list.className).toMatch(/\bmd:hidden\b/);
  expect(screen.getByRole("table").closest("[data-wide-table]")?.className).toMatch(/\bhidden\b.*\bmd:block\b/);
}

describe("Produits on phones", () => {
  const products: ProductListItem[] = [
    { id: "p1", sellsy_id: "12", sku: "CAU-1", name: "Colombie Cauca", custom_name: null, origin: "Colombie",
      roast_level: "espresso", price_per_kg: 26.5, custom_price_per_kg: null, data_source_mode: "sellsy",
      is_active: true, image_url: null, kind: "coffee" },
    { id: "loberz", sellsy_id: "2", sku: "0001", name: "Livraison", custom_name: null, origin: null, roast_level: null,
      price_per_kg: 24, custom_price_per_kg: null, data_source_mode: "sellsy", is_active: true, image_url: null, kind: "service" },
  ];

  it("shows each coffee as a tappable card with origin, price and status", () => {
    const onOpen = vi.fn();
    render(<AdminProductsList products={products} loading={false} error={null} onOpen={onOpen} onDelete={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Produits" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(1); // the delivery service is not a product card
    expect(within(cards[0]).getByText("Colombie Cauca")).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Colombie · espresso/)).toBeInTheDocument();
    expect(within(cards[0]).getByText("€26.50/kg")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Actif")).toBeInTheDocument();
    fireEvent.click(within(cards[0]).getByRole("button", { name: /^Colombie Cauca/ }));
    expect(onOpen).toHaveBeenCalledWith(products[0]);
    expectPhoneCardsAndWideTable(list);
  });

  it("deletes from the card without opening the product", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(<AdminProductsList products={products} loading={false} error={null} onOpen={onOpen} onDelete={onDelete} />);
    const card = within(screen.getByRole("list", { name: "Produits" })).getAllByRole("listitem")[0];
    fireEvent.click(within(card).getByRole("button", { name: "Supprimer Colombie Cauca" }));
    expect(onDelete).toHaveBeenCalledWith(products[0]);
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("Tarifs on phones", () => {
  it("shows each tier as a card with its discounts and edit/delete buttons", async () => {
    render(<PricingTiersView />);
    const list = await screen.findByRole("list", { name: "Paliers tarifaires" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("100 kilos")).toBeInTheDocument();
    expect(within(cards[0]).getByText(/-10 % café/)).toBeInTheDocument();
    expect(within(cards[1]).getByText(/Livraison offerte/)).toBeInTheDocument();
    expect(within(cards[1]).getByText("Inactif")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("button", { name: "Modifier 100 kilos" })).toBeInTheDocument();
    expect(within(cards[0]).getByRole("button", { name: "Supprimer 100 kilos" })).toBeInTheDocument();
    expectPhoneCardsAndWideTable(list);
  });
});

describe("Stock on phones", () => {
  it("shows each coffee's stock, threshold and status as a card", () => {
    render(withQuery(<StockView />));
    const list = screen.getByRole("list", { name: "Stock" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Colombie SANTA BARBARA — Filtre")).toBeInTheDocument();
    expect(within(cards[0]).getByText("3.50")).toBeInTheDocument();
    expect(within(cards[0]).getByText(/seuil 5\.00 kg/)).toBeInTheDocument();
    expect(within(cards[0]).getByText("Stock bas")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("button", { name: "Modifier le stock de Colombie SANTA BARBARA — Filtre" })).toBeInTheDocument();
    expect(within(cards[0]).getByRole("button", { name: "Historique de Colombie SANTA BARBARA — Filtre" })).toBeInTheDocument();
    expect(within(cards[1]).getByText("Non suivi")).toBeInTheDocument();
    expect(within(cards[1]).getByRole("button", { name: /Configurer/ })).toBeInTheDocument();
    expectPhoneCardsAndWideTable(list);
  });
});

describe("Équipe on phones", () => {
  it("shows each user as a card with role, status and an actions menu", async () => {
    render(<UserManagementView />);
    const list = await screen.findByRole("list", { name: "Utilisateurs" });
    const cards = await within(list).findAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("Camille Dupont")).toBeInTheDocument();
    expect(within(cards[0]).getByText("camille@amulette.example")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("button", { name: "Actions pour Camille Dupont" })).toBeInTheDocument();
    expectPhoneCardsAndWideTable(list);
  });
});
