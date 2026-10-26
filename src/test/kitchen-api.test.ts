import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  kitchenErrorMessage,
  notifyKitchen,
  useApproveOrder,
  mapOrder,
} from "@/kitchen/api";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

const fr = {
  cutoffPassed: "La date limite est dépassée",
  generic: "Une erreur est survenue",
};
// Minimal strings object; kitchenErrorMessage only reads t.errors.*
const t = { errors: { ...fr, orderLocked: "l", forbidden: "f", emptyOrder: "e", productHidden: "p", invalidStatus: "s", invalidInput: "i", notKitchenMember: "n" } } as any;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

describe("kitchenErrorMessage", () => {
  it("maps known codes and falls back to generic", () => {
    expect(kitchenErrorMessage({ message: "cutoff_passed" }, t)).toBe(fr.cutoffPassed);
    expect(kitchenErrorMessage({ message: "boom" }, t)).toBe(fr.generic);
    expect(kitchenErrorMessage(null, t)).toBe(fr.generic);
  });
});

describe("notifyKitchen", () => {
  beforeEach(() => vi.clearAllMocks());
  it("resolves when invoke rejects", async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error("network"));
    await expect(notifyKitchen("order_sent", "o1")).resolves.toBeUndefined();
  });
  it("resolves when invoke returns an error", async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: null, error: new Error("x") });
    await expect(notifyKitchen("order_sent", "o1")).resolves.toBeUndefined();
  });
});

describe("useApproveOrder", () => {
  beforeEach(() => vi.clearAllMocks());
  it("notifies with the changes on success", async () => {
    const changes = [{ product_name: "Pandebono", from: 2, to: 1 }];
    (supabase.rpc as any).mockResolvedValue({ data: { changes }, error: null });
    (supabase.functions.invoke as any).mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useApproveOrder(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ orderId: "o1" });
    });
    expect(supabase.rpc).toHaveBeenCalledWith("kitchen_approve_order", { p_order_id: "o1" });
    await waitFor(() =>
      expect(supabase.functions.invoke).toHaveBeenCalledWith("notify-kitchen", {
        body: { event: "order_approved", orderId: "o1", extra: { changes } },
      }),
    );
  });
});

describe("mapOrder", () => {
  it("maps a joined row to a KitchenOrder", () => {
    const o = mapOrder({
      id: "o1", cafe_id: "c1", week_start: "2026-11-02", kind: "weekly", status: "sent",
      urgent_reason: null, needed_by: null, ready_eta: null,
      kitchen_cafes: { name: "Artivistas" },
      kitchen_order_items: [
        { product_id: "p1", product_name: "Pandebono", unit_label: "Batch", pieces_per_unit: 50, units: 2, adjusted_units: 1, served_from_stock_units: 0 },
      ],
    } as any);
    expect(o.cafeName).toBe("Artivistas");
    expect(o.items[0]).toEqual({
      productId: "p1", productName: "Pandebono", unitLabel: "Batch", piecesPerUnit: 50,
      units: 2, adjustedUnits: 1, servedFromStockUnits: 0,
    });
  });
});
