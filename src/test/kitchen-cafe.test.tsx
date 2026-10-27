import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { products, item, order } from "./kitchen-fixtures";
import type { KitchenOrder, KitchenProduct } from "@/kitchen/types";

const mocks = vi.hoisted(() => ({
  products: [] as KitchenProduct[],
  week: { weekStart: "2026-11-02", cutoffAt: "2099-01-01T20:00:00Z" },
  orders: [] as KitchenOrder[],
  createUrgent: vi.fn(),
  setItem: vi.fn(),
  draft: vi.fn(),
}));

vi.mock("@/kitchen/api", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue("o1"), isPending: false });
  return {
    useKitchenProducts: () => ({ data: mocks.products, isLoading: false }),
    useCurrentWeek: () => ({ data: mocks.week, isLoading: false }),
    useKitchenOrders: () => ({ data: mocks.orders, isLoading: false }),
    useSetItem: () => ({ mutate: vi.fn(), mutateAsync: mocks.setItem, isPending: false }),
    useGetOrCreateDraft: () => ({ mutate: vi.fn(), mutateAsync: mocks.draft, isPending: false }),
    useSendOrder: mut,
    useMarkReceived: mut,
    useCreateUrgentOrder: () => ({ mutate: mocks.createUrgent, mutateAsync: mocks.createUrgent, isPending: false }),
    kitchenErrorMessage: () => "err",
  };
});

import { act } from "@testing-library/react";
import CafeHome from "@/kitchen/cafe/CafeHome";
import CafeOrders from "@/kitchen/cafe/CafeOrders";
import UrgentOrderSheet from "@/kitchen/cafe/UrgentOrderSheet";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const hidden = { id: "p4", name: "Secret scone", unitLabel: "Batch", piecesPerUnit: 10, stockUnits: 3, productionMinutes: 10, isVisible: false };

beforeEach(() => {
  mocks.products = [...products, hidden];
  mocks.week = { weekStart: "2026-11-02", cutoffAt: "2099-01-01T20:00:00Z" };
  mocks.orders = [];
  mocks.createUrgent.mockClear();
  mocks.setItem.mockReset().mockResolvedValue(undefined);
  mocks.draft.mockReset().mockResolvedValue("o1");
});

describe("CafeHome", () => {
  it("renders the 3 visible products and not the hidden one", () => {
    render(<CafeHome cafeId="c1" cafeName="Artivistas" />);
    expect(screen.getByText("Pandebono")).toBeInTheDocument();
    expect(screen.getByText("Cookies")).toBeInTheDocument();
    expect(screen.getByText("Banana bread")).toBeInTheDocument();
    expect(screen.queryByText("Secret scone")).toBeNull();
  });

  it("shows the will-be-produced hint when stock is 0", () => {
    render(<CafeHome cafeId="c1" cafeName="Artivistas" />);
    expect(screen.getAllByText(/0 en stock, sera produit/).length).toBe(2);
  });

  // The server's current week is the ordering week, so its cutoff is always in the future.
  it("always offers the urgent order, even with a sent order and a future cutoff", () => {
    mocks.orders = [order({ cafeId: "c1", status: "sent", items: [item("p1", 2)] })];
    render(<CafeHome cafeId="c1" cafeName="Artivistas" />);
    expect(screen.getByRole("button", { name: "Commande urgente" })).toBeInTheDocument();
    for (const b of screen.getAllByLabelText("Increase quantity")) expect(b).toBeEnabled();
  });

  it("opens the urgent sheet from the always-visible button", () => {
    render(<CafeHome cafeId="c1" cafeName="Artivistas" />);
    fireEvent.click(screen.getByRole("button", { name: "Commande urgente" }));
    expect(screen.getByRole("button", { name: "Envoyer la demande" })).toBeInTheDocument();
  });

  it("shows an existing line of a hidden product so it can be removed, and counts it", () => {
    const hiddenLine = { ...item("p1", 1), productId: "p4", productName: "Secret scone", piecesPerUnit: 10, units: 3 };
    mocks.orders = [order({ id: "oh", cafeId: "c1", status: "draft", items: [item("p1", 2), hiddenLine] })];
    render(<CafeHome cafeId="c1" cafeName="Artivistas" />);
    expect(screen.getByText("Secret scone")).toBeInTheDocument();
    expect(screen.getByText("Plus disponible")).toBeInTheDocument();
    expect(screen.getByText("5 unités")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retirer Secret scone" }));
    expect(screen.getByText("2 unités")).toBeInTheDocument();
  });
});

describe("CafeOrders", () => {
  it("renders an adjusted line as 1 → 2", () => {
    mocks.orders = [order({ cafeId: "c1", status: "approved", items: [item("p1", 1, 2)] })];
    render(<CafeOrders cafeId="c1" />);
    expect(screen.getByText(/1 → 2/)).toBeInTheDocument();
  });

  it("offers confirm-received on a ready order", () => {
    mocks.orders = [order({ cafeId: "c1", status: "ready", items: [item("p1", 1)] })];
    render(<CafeOrders cafeId="c1" />);
    expect(screen.getByRole("button", { name: "Confirmer la réception" })).toBeInTheDocument();
  });
});

describe("UrgentOrderSheet", () => {
  it("disables submit with an empty reason", () => {
    render(<UrgentOrderSheet open onOpenChange={() => {}} cafeId="c1" products={products} />);
    fireEvent.click(screen.getAllByLabelText("Increase quantity")[0]);
    expect(screen.getByRole("button", { name: "Envoyer la demande" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Pourquoi/), { target: { value: "Rupture" } });
    expect(screen.getByRole("button", { name: "Envoyer la demande" })).toBeEnabled();
  });
});

describe("CafeHome saving", () => {
  const inc = () => screen.getAllByLabelText("Increase quantity")[0];

  it("flushes a pending edit when unmounted within the debounce window", () => {
    mocks.orders = [order({ cafeId: "c1", status: "draft", items: [] })];
    const { unmount } = render(<CafeHome cafeId="c1" cafeName="A" />);
    fireEvent.click(inc());
    unmount();
    expect(mocks.setItem).toHaveBeenCalledWith({ orderId: mocks.orders[0].id, productId: "p1", units: 1 });
  });

  it("reverts the stepper when the save fails", async () => {
    vi.useFakeTimers();
    try {
      mocks.setItem.mockRejectedValue({ message: "cutoff_passed" });
      render(<CafeHome cafeId="c1" cafeName="A" />);
      mocks.draft.mockResolvedValue("o1");
      fireEvent.click(inc());
      expect(screen.getAllByText("1").length).toBeGreaterThan(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(screen.queryByText("1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates the draft once for two quick changes", async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (v: string) => void;
      mocks.draft.mockReturnValue(new Promise((r) => { resolve = r; }));
      render(<CafeHome cafeId="c1" cafeName="A" />);
      fireEvent.click(screen.getAllByLabelText("Increase quantity")[0]);
      fireEvent.click(screen.getAllByLabelText("Increase quantity")[1]);
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      resolve("o1");
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(mocks.draft).toHaveBeenCalledTimes(1);
      expect(mocks.setItem).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides Send once the order is sent", () => {
    mocks.orders = [order({ cafeId: "c1", status: "sent", items: [item("p1", 1)] })];
    render(<CafeHome cafeId="c1" cafeName="A" />);
    expect(screen.queryByRole("button", { name: "Envoyer" })).toBeNull();
  });
});

describe("declined urgent order", () => {
  it("shows the decline note", () => {
    mocks.orders = [order({ cafeId: "c1", kind: "urgent", status: "declined", declineNote: "Plus de farine", items: [item("p1", 1)] })];
    render(<CafeOrders cafeId="c1" />);
    expect(screen.getByText("Refusée : Plus de farine")).toBeInTheDocument();
  });
});

describe("UrgentOrderSheet needed-by", () => {
  it("disables submit when needed-by is in the past", () => {
    render(<UrgentOrderSheet open onOpenChange={() => {}} cafeId="c1" products={products} />);
    fireEvent.click(screen.getAllByLabelText("Increase quantity")[0]);
    fireEvent.change(screen.getByPlaceholderText(/Pourquoi/), { target: { value: "x" } });
    fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: "2020-01-01T10:00" } });
    expect(screen.getByRole("button", { name: "Envoyer la demande" })).toBeDisabled();
  });
});
