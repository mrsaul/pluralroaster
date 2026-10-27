import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { products, item, order } from "./kitchen-fixtures";
import type { KitchenOrder } from "@/kitchen/types";

const mocks = vi.hoisted(() => ({
  orders: [] as KitchenOrder[],
  updateProduct: vi.fn(),
  createProduct: vi.fn(),
  updateSettings: vi.fn(),
  markReady: vi.fn(),
  setEta: vi.fn(),
}));

vi.mock("@/kitchen/api", () => ({
  useKitchenProducts: () => ({ data: products }),
  useCurrentWeek: () => ({ data: { weekStart: "2026-11-02", cutoffAt: "2099-01-01T20:00:00Z" } }),
  useKitchenSettings: () => ({
    data: { cutoffWeekday: 0, cutoffTime: "20:00:00", reminderHoursBefore: 24, weeklyCapacityMinutes: 600 },
  }),
  useKitchenOrders: () => ({ data: mocks.orders }),
  useUpdateProduct: () => ({ mutate: mocks.updateProduct, isPending: false }),
  useCreateProduct: () => ({ mutate: mocks.createProduct, isPending: false }),
  useUpdateSettings: () => ({ mutate: mocks.updateSettings, isPending: false }),
  useMarkReady: () => ({ mutate: mocks.markReady, isPending: false }),
  useSetReadyEta: () => ({ mutate: mocks.setEta, isPending: false }),
  kitchenErrorMessage: () => "err",
}));

import ProductionView from "@/kitchen/kitchen/ProductionView";
import KitchenOrdersList from "@/kitchen/kitchen/KitchenOrdersList";
import ProductsEditor from "@/kitchen/kitchen/ProductsEditor";
import KitchenSettings from "@/kitchen/kitchen/KitchenSettings";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockReset());
  mocks.orders = [
    order({ cafeId: "c1", cafeName: "Artivistas", items: [item("p1", 1)] }),
    order({ cafeId: "c2", cafeName: "Nouveau café", items: [item("p1", 2)] }),
  ];
});

describe("ProductionView", () => {
  it("shows the pandebono row with to-produce 2 and the per-café breakdown", () => {
    render(<ProductionView />);
    expect(screen.getByText("Pandebono")).toBeInTheDocument();
    expect(screen.getByText("Artivistas 1 · Nouveau café 2")).toBeInTheDocument();
    expect(screen.getByTestId("to-produce-p1")).toHaveTextContent("2");
    expect(screen.getByTestId("to-produce-p1")).toHaveTextContent("100 pcs");
  });
  it("shows an empty state when nothing is approved", () => {
    mocks.orders = [];
    render(<ProductionView />);
    expect(screen.getByText(/Aucune commande approuvée/)).toBeInTheDocument();
  });
});

describe("KitchenOrdersList", () => {
  it("lists urgent first and confirms mark ready with the stock split", () => {
    mocks.orders = [
      order({ id: "w", cafeId: "c1", cafeName: "Artivistas", items: [item("p1", 3)] }),
      order({ id: "u", cafeId: "c2", cafeName: "Zèbre", kind: "urgent", neededBy: "2026-11-03T08:00:00Z", items: [item("p2", 1)] }),
    ];
    render(<KitchenOrdersList />);
    const names = screen.getAllByTestId("order-cafe").map((e) => e.textContent);
    expect(names).toEqual(["Zèbre", "Artivistas"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Marquer prête" })[1]);
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Pandebono/)).toHaveTextContent("du stock : 1");
    expect(within(dialog).getByText(/Pandebono/)).toHaveTextContent("à produire : 2");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer" }));
    expect(mocks.markReady).toHaveBeenCalledWith({ orderId: "w" }, expect.anything());
  });
});

describe("ProductsEditor", () => {
  it("never goes below 0 stock", () => {
    render(<ProductsEditor />);
    const card = screen.getByTestId("product-p2");
    fireEvent.click(within(card).getByLabelText("Decrease quantity"));
    expect(within(card).getByTestId("stock-stepper")).toHaveTextContent("0");
  });
  it("refuses 0 pieces per unit with a validation error", () => {
    render(<ProductsEditor />);
    const card = screen.getByTestId("product-p1");
    fireEvent.change(within(card).getByLabelText("Pièces par unité"), { target: { value: "0" } });
    fireEvent.click(within(card).getByRole("button", { name: "Enregistrer" }));
    expect(within(card).getByRole("alert")).toBeInTheDocument();
    expect(mocks.updateProduct).not.toHaveBeenCalled();
  });
  it("saves a valid edit", () => {
    render(<ProductsEditor />);
    const card = screen.getByTestId("product-p1");
    fireEvent.change(within(card).getByLabelText("Pièces par unité"), { target: { value: "40" } });
    fireEvent.click(within(card).getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      { id: "p1", patch: expect.objectContaining({ piecesPerUnit: 40, stockUnits: 1 }) },
      expect.anything(),
    );
  });
});

describe("KitchenSettings", () => {
  it("saves 30 h as 1800 minutes", () => {
    render(<KitchenSettings />);
    fireEvent.change(screen.getByLabelText("Heures disponibles par semaine"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ weeklyCapacityMinutes: 1800, cutoffWeekday: 0, cutoffTime: "20:00:00", reminderHoursBefore: 24 }),
      expect.anything(),
    );
  });
  it("refuses 0 hours", () => {
    render(<KitchenSettings />);
    fireEvent.change(screen.getByLabelText("Heures disponibles par semaine"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
