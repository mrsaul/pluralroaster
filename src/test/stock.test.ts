import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStockList, updateStock } from "../services/stock";
import { supabase } from "../integrations/supabase/client";

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe("stock service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getStockList should fetch and transform data correctly", async () => {
    const mockData = [
      {
        id: "p1",
        name: "Coffee A",
        data_source_mode: "sellsy",
        is_active: true,
        roasted_stock: [
          {
            id: "s1",
            quantity_kg: 10,
            low_stock_threshold_kg: 5,
            profiles: { full_name: "Admin" },
          },
        ],
      },
    ];

    // Mock the chain: supabase.from().select().eq().order()
    const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as any).mockReturnValue({ select: mockSelect });

    const result = await getStockList();

    expect(result).toHaveLength(1);
    expect(result[0].product_name).toBe("Coffee A");
    expect(result[0].quantity_kg).toBe(10);
    expect(result[0].is_low).toBe(false);
    expect(result[0].updater_name).toBe("Admin");
  });

  it("getStockList should identify low stock", async () => {
    const mockData = [
      {
        id: "p1",
        name: "Coffee A",
        data_source_mode: "sellsy",
        is_active: true,
        roasted_stock: [
          {
            id: "s1",
            quantity_kg: 2,
            low_stock_threshold_kg: 5,
          },
        ],
      },
    ];

    const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as any).mockReturnValue({ select: mockSelect });

    const result = await getStockList();
    expect(result[0].is_low).toBe(true);
  });

  it("getStockList only requests coffee products", async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as any).mockReturnValue({ select: mockSelect });

    await getStockList();

    expect(mockEq).toHaveBeenCalledWith("kind", "coffee");
    expect(mockEq).toHaveBeenCalledTimes(1);
  });

  it("getStockList keeps inactive coffees that still have roasted stock", async () => {
    const mockData = [
      { id: "p1", name: "Active", data_source_mode: "sellsy", is_active: true, roasted_stock: [] },
      {
        id: "p2", name: "Inactive with stock", data_source_mode: "sellsy", is_active: false,
        roasted_stock: [{ id: "s2", quantity_kg: 3, low_stock_threshold_kg: 1 }],
      },
      {
        id: "p3", name: "Inactive empty", data_source_mode: "sellsy", is_active: false,
        roasted_stock: [{ id: "s3", quantity_kg: 0, low_stock_threshold_kg: 1 }],
      },
      { id: "p4", name: "Inactive untracked", data_source_mode: "sellsy", is_active: false, roasted_stock: [] },
    ];
    const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as any).mockReturnValue({ select: mockSelect });

    const result = await getStockList();

    expect(result.map((r) => r.product_id).sort()).toEqual(["p1", "p2"]);
    expect(result.find((r) => r.product_id === "p2")?.quantity_kg).toBe(3);
  });

  it("updateStock should call the atomic RPC", async () => {
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });

    await updateStock("s1", 20, 5, "Audit note");

    expect(supabase.rpc).toHaveBeenCalledWith("update_stock_with_history", {
      p_stock_id: "s1",
      p_new_qty: 20,
      p_new_threshold: 5,
      p_note: "Audit note",
      p_updated_by: "u1",
    });
  });

  it("updateStock should throw error if not authenticated", async () => {
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(updateStock("s1", 20, 5)).rejects.toThrow("Not authenticated");
  });
});
