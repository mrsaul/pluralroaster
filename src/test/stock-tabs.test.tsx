import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoastingLine } from "@/lib/roasting";
import type { StockHistoryRow, StockListItem } from "@/services/stock";

const line = (o: Partial<RoastingLine> & { productId: string; productName: string; quantityKg: number }): RoastingLine => ({
  orderId: "o1",
  kind: "coffee",
  deliveryDate: "2026-12-01",
  ...o,
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

let lines: RoastingLine[] = [];
let linesError: Error | null = null;
let history: Partial<StockHistoryRow>[] = [];

vi.mock("@/hooks/useRoasting", () => ({
  useRoastingInputs: () => ({
    data: {
      stockKg: { br: 70 },
      productPercent: { br: 17 },
      defaultPercent: 15,
      productNames: { gh: "Colombie – Golden Huila", br: "Brésil" },
    },
    isLoading: false,
    error: null,
  }),
  useOpenRoastingLines: () => ({
    data: linesError ? undefined : lines,
    isLoading: false,
    error: linesError,
  }),
  useAddRoastedStock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSetGreenPercent: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSetDefaultGreenPercent: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const stock: StockListItem[] = [
  { id: "s1", product_id: "gh", quantity_kg: 3.5, low_stock_threshold_kg: 5, last_updated_by: null,
    last_updated_at: "2026-11-10T09:00:00Z", created_at: null, product_name: "Colombie – Golden Huila", updater_name: "Saul", is_low: true },
];
vi.mock("@/hooks/useStock", () => ({
  useStockList: () => ({ data: stock, isLoading: false }),
  useUpdateStock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useStockHistory: () => ({ data: history, isLoading: false }),
  useInitStock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import { StockView } from "@/components/StockView";

const renderView = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <StockView />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  linesError = null;
  history = [];
  lines = [
    line({ orderId: "a", productId: "gh", productName: "Golden Huila (ligne)", quantityKg: 30, deliveryDate: "2026-12-01" }),
    line({ orderId: "b", productId: "br", productName: "Brésil", quantityKg: 50, deliveryDate: "2026-12-03" }),
    line({ orderId: "c", productId: "br", productName: "Brésil", quantityKg: 35, deliveryDate: "2026-12-05" }),
  ];
});

describe("Stock tabs", () => {
  it("opens on À torréfier with the count and per-product cards", () => {
    renderView();
    expect(screen.getByRole("tab", { name: "À torréfier (2)" })).toBeInTheDocument();
    const cards = within(screen.getByRole("list", { name: "À torréfier" })).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole("heading", { name: "Colombie – Golden Huila" })).toBeInTheDocument();
    expect(within(cards[0]).getByText("30.00 kg", { selector: ".text-2xl" })).toBeInTheDocument();
    expect(within(cards[0]).getByText("34.50 kg")).toBeInTheDocument();
    expect(within(cards[1]).getByText("17 %")).toBeInTheDocument();
    expect(within(cards[1]).getByText("17.55 kg")).toBeInTheDocument();
  });

  it("opens the roasted sheet from a card", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Torréfié Colombie – Golden Huila" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Torréfié · Colombie – Golden Huila")).toBeInTheDocument();
  });

  it("shows the empty state and a zero count", () => {
    lines = [];
    renderView();
    expect(screen.getByRole("tab", { name: "À torréfier (0)" })).toBeInTheDocument();
    expect(screen.getByText("Rien à torréfier : le stock couvre toutes les commandes.")).toBeInTheDocument();
  });

  it("shows a query error", () => {
    linesError = new Error("boom");
    renderView();
    expect(screen.getByText("Impossible de calculer le torréfié : boom")).toBeInTheDocument();
  });

  it("labels roasted history rows in the stock tab", () => {
    history = [{
      id: "h1", stock_id: "s1", previous_quantity_kg: 0, new_quantity_kg: 28, delta_kg: 28,
      change_type: "roasted", note: null, order_id: null, order_reference: null,
      updated_by: null, updated_at: "2026-11-10T09:00:00Z", updater_name: "Saul",
    }];
    renderView();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Stock torréfié" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Historique de Colombie – Golden Huila" })[0]);
    expect(screen.getByText("Torréfaction")).toBeInTheDocument();
  });
});
