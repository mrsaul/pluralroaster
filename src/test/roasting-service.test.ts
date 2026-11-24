import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOpenRoastingLines,
  getRoastingInputs,
  addRoastedStock,
  setGreenPercent,
  setDefaultGreenPercent,
} from "../services/roasting";
import { supabase } from "../integrations/supabase/client";

vi.mock("../integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

const from = supabase.from as any;
const rpc = supabase.rpc as any;

describe("roasting service", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getOpenRoastingLines", () => {
    it("maps rows and filters on open status and not packed", async () => {
      const rows = [
        {
          id: "o1",
          delivery_date: "2026-12-01",
          order_items: [
            { product_id: "p1", product_name: "Kenya", quantity: "2.5", kind: "coffee" },
            { product_id: "p2", product_name: "Livraison", quantity: 1, kind: "service" },
            { product_id: null, product_name: "Libre", quantity: 3, kind: "coffee" },
            { product_id: "p3", product_name: "Autre", quantity: 4, kind: "other" },
          ],
        },
      ];
      const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
      const inFn = vi.fn().mockReturnValue({ eq });
      const select = vi.fn().mockReturnValue({ in: inFn });
      from.mockReturnValue({ select });

      const lines = await getOpenRoastingLines();

      expect(from).toHaveBeenCalledWith("orders");
      expect(inFn).toHaveBeenCalledWith("status", ["received", "approved", "packaging"]);
      expect(eq).toHaveBeenCalledWith("is_packed", false);
      expect(lines).toEqual([
        { orderId: "o1", productId: "p1", productName: "Kenya", quantityKg: 2.5, kind: "coffee", deliveryDate: "2026-12-01" },
        { orderId: "o1", productId: "p2", productName: "Livraison", quantityKg: 1, kind: "service", deliveryDate: "2026-12-01" },
        { orderId: "o1", productId: "p3", productName: "Autre", quantityKg: 4, kind: "coffee", deliveryDate: "2026-12-01" },
      ]);
    });

    it("throws Supabase errors", async () => {
      const eq = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
      from.mockReturnValue({ select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({ eq }) }) });
      await expect(getOpenRoastingLines()).rejects.toThrow("boom");
    });
  });

  describe("getRoastingInputs", () => {
    function mockTables(opts: { stock?: any; products?: any; settings?: any }) {
      from.mockImplementation((table: string) => {
        if (table === "roasted_stock")
          return { select: vi.fn().mockResolvedValue(opts.stock ?? { data: [], error: null }) };
        if (table === "products")
          return { select: vi.fn().mockResolvedValue(opts.products ?? { data: [], error: null }) };
        if (table === "roasting_settings")
          return {
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(opts.settings ?? { data: null, error: null }),
            }),
          };
        throw new Error("unexpected table " + table);
      });
    }

    it("falls back to 15 with no settings row and keeps null percent", async () => {
      mockTables({
        stock: { data: [{ product_id: "p1", quantity_kg: "4.5" }], error: null },
        products: {
          data: [
            { id: "p1", name: "Kenya", custom_name: null, data_source_mode: "sellsy", green_percent: null },
            { id: "p2", name: "Brut", custom_name: "Mon Brésil", data_source_mode: "custom", green_percent: 12 },
          ],
          error: null,
        },
      });

      const r = await getRoastingInputs();

      expect(r.defaultPercent).toBe(15);
      expect(r.stockKg).toEqual({ p1: 4.5 });
      expect(r.productPercent).toEqual({ p1: null, p2: 12 });
      expect(r.productNames).toEqual({ p1: "Kenya", p2: "Mon Brésil" });
    });

    it("uses the settings default when present", async () => {
      mockTables({ settings: { data: { default_green_percent: "18" }, error: null } });
      expect((await getRoastingInputs()).defaultPercent).toBe(18);
    });

    it("throws Supabase errors", async () => {
      mockTables({ settings: { data: null, error: new Error("denied") } });
      await expect(getRoastingInputs()).rejects.toThrow("denied");
    });
  });

  describe("rpc wrappers", () => {
    it("addRoastedStock calls the rpc and returns the new quantity", async () => {
      rpc.mockResolvedValue({ data: 7.5, error: null });
      const n = await addRoastedStock("p1", 2.5);
      expect(rpc).toHaveBeenCalledWith("add_roasted_stock", { p_product_id: "p1", p_kg: 2.5, p_note: null });
      expect(n).toBe(7.5);
    });

    it("addRoastedStock passes the trimmed note", async () => {
      rpc.mockResolvedValue({ data: 3, error: null });
      await addRoastedStock("p1", 1, " lot 4 ");
      expect(rpc).toHaveBeenCalledWith("add_roasted_stock", { p_product_id: "p1", p_kg: 1, p_note: "lot 4" });
    });

    it("addRoastedStock throws errors", async () => {
      rpc.mockResolvedValue({ data: null, error: new Error("nope") });
      await expect(addRoastedStock("p1", 1)).rejects.toThrow("nope");
    });

    it("setGreenPercent and setDefaultGreenPercent call their rpcs", async () => {
      rpc.mockResolvedValue({ data: null, error: null });
      await setGreenPercent("p1", null);
      expect(rpc).toHaveBeenCalledWith("set_green_percent", { p_product_id: "p1", p_percent: null });
      await setDefaultGreenPercent(16);
      expect(rpc).toHaveBeenCalledWith("set_default_green_percent", { p_percent: 16 });
    });
  });
});
