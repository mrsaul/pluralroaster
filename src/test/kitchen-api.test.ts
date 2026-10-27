import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  kitchenErrorMessage,
  notifyKitchen,
  useApproveOrder,
  useGetOrCreateDraft,
  useSetItem,
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
const t = { errors: { ...fr, orderLocked: "l", forbidden: "f", emptyOrder: "e", productHidden: "p", invalidStatus: "s", invalidInput: "i", notKitchenMember: "n", noRound: "Aucune tournée de production configurée.", roundInUse: "Cette tournée a des commandes : désactivez-la plutôt que de la supprimer." } } as unknown as Parameters<typeof kitchenErrorMessage>[1];

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

describe("kitchenErrorMessage", () => {
  it("maps known codes and falls back to generic", () => {
    expect(kitchenErrorMessage({ message: "cutoff_passed" }, t)).toBe(fr.cutoffPassed);
    expect(kitchenErrorMessage({ message: "boom" }, t)).toBe(fr.generic);
    expect(kitchenErrorMessage(null, t)).toBe(fr.generic);
    expect(kitchenErrorMessage({ message: "no_round" }, t)).toBe("Aucune tournée de production configurée.");
    expect(kitchenErrorMessage({ message: "round_in_use" }, t)).toBe(
      "Cette tournée a des commandes : désactivez-la plutôt que de la supprimer.",
    );
  });
});

describe("notifyKitchen", () => {
  beforeEach(() => vi.clearAllMocks());
  it("resolves when invoke rejects", async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error("network"));
    await expect(notifyKitchen("order_sent", "o1")).resolves.toBeUndefined();
  });
  it("resolves when invoke returns an error", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: new Error("x") });
    await expect(notifyKitchen("order_sent", "o1")).resolves.toBeUndefined();
  });
});

describe("useApproveOrder", () => {
  beforeEach(() => vi.clearAllMocks());
  it("notifies with the changes on success", async () => {
    const changes = [{ product_name: "Pandebono", from: 2, to: 1 }];
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { changes }, error: null } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: {}, error: null });
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
      id: "o1", cafe_id: "c1", production_date: "2026-11-03", round_id: "r1", kind: "weekly", status: "sent",
      urgent_reason: null, needed_by: null, ready_eta: null, decline_note: "Pas de stock",
      kitchen_cafes: { name: "Artivistas" },
      kitchen_order_items: [
        { product_id: "p1", product_name: "Pandebono", unit_label: "Batch", pieces_per_unit: 50, units: 2, adjusted_units: 1, served_from_stock_units: 0 },
      ],
    } as unknown as Parameters<typeof mapOrder>[0]);
    expect(o.cafeName).toBe("Artivistas");
    expect(o.declineNote).toBe("Pas de stock");
    expect(o.productionDate).toBe("2026-11-03");
    expect(o.roundId).toBe("r1");
    expect(o.items[0]).toEqual({
      productId: "p1", productName: "Pandebono", unitLabel: "Batch", piecesPerUnit: 50,
      units: 2, adjustedUnits: 1, servedFromStockUnits: 0,
    });
  });
});

describe("useGetOrCreateDraft", () => {
  beforeEach(() => vi.clearAllMocks());
  it("calls the RPC with p_cafe_id and returns the order id", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "o9", error: null } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);
    const { result } = renderHook(() => useGetOrCreateDraft(), { wrapper: wrapper() });
    let id: unknown;
    await act(async () => {
      id = await result.current.mutateAsync({ cafeId: "c1" });
    });
    expect(id).toBe("o9");
    expect(supabase.rpc).toHaveBeenCalledWith("kitchen_get_or_create_draft", { p_cafe_id: "c1" });
  });
  it("passes p_production_date when given", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "o9", error: null } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);
    const { result } = renderHook(() => useGetOrCreateDraft(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ productionDate: "2026-11-06" });
    });
    expect(supabase.rpc).toHaveBeenCalledWith("kitchen_get_or_create_draft", { p_production_date: "2026-11-06" });
  });
});

describe("useSetItem", () => {
  beforeEach(() => vi.clearAllMocks());
  const run = async (flipped: boolean) => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: flipped, error: null } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useSetItem(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ orderId: "o1", productId: "p1", units: 2 });
    });
  };
  it("notifies order_sent when the edit flipped an approved order back to sent", async () => {
    await run(true);
    await waitFor(() =>
      expect(supabase.functions.invoke).toHaveBeenCalledWith("notify-kitchen", {
        body: { event: "order_sent", orderId: "o1", extra: undefined },
      }),
    );
  });
  it("does not notify on an ordinary edit", async () => {
    await run(false);
    await act(async () => {});
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
