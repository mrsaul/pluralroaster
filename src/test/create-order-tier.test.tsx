import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const AMULETTE = { name: "Amulette", product_discount_percent: 5, kg_discount_percent: 5, bag_discount_percent: 5, volume_threshold_kg: 30, volume_kg_discount_percent: 10 };
const OLD_TIER = { name: "30 kilos", product_discount_percent: 5, kg_discount_percent: 5, bag_discount_percent: 5, volume_threshold_kg: null, volume_kg_discount_percent: null };

const db = vi.hoisted(() => ({
  tier: null as unknown,
  tierError: null as { message: string } | null,
  orderInserts: [] as unknown[],
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const result = () => table === "companies"
      ? { data: db.tierError ? null : { pricing_tiers: db.tier }, error: db.tierError }
      : { data: [], error: null };
    const c: any = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
        if (prop === "insert") return (row: unknown) => { if (table === "orders") db.orderInserts.push(row); return c; };
        return () => c;
      },
    });
    return c;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "admin-1" } } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

import { CreateOrderDialog, type SimpleClient, type SimpleProduct } from "@/components/CreateOrderDialog";

const client = { company_id: "c1", user_id: "u1", company_name: "SAUL TEST", contact_name: null, email: null, custom_company_name: null, client_data_mode: "sellsy", pricing_tier_id: "t-amulette", free_delivery: false } as SimpleClient;
const product = { id: "p1", name: "Colombie - Golden Huila", custom_name: null, sku: "003", price_per_kg: 27.5, custom_price_per_kg: null, data_source_mode: "sellsy", is_active: true, kind: "coffee", vat_rate: 5.5 } as SimpleProduct;

/** The draft saved before the client moved from "30 kilos" to the Amulette tier. */
function saveOldDraft() {
  localStorage.setItem("draft:create-order:admin-1", JSON.stringify({
    savedAt: new Date().toISOString(),
    data: {
      selectedCompanyId: "c1",
      deliveryDateStr: "2026-11-25T12:00:00.000Z",
      notes: "",
      clientTier: OLD_TIER,
      lineItems: [{ product, quantity: 30, price_per_kg: 27.5 }],
    },
  }));
}

function renderDialog() {
  return render(<CreateOrderDialog open onOpenChange={vi.fn()} clients={[client]} products={[product]} onCreated={vi.fn()} />);
}

describe("Nouvelle commande uses the client's current tier", () => {
  beforeEach(() => {
    localStorage.clear();
    db.tier = AMULETTE;
    db.tierError = null;
    db.orderInserts.length = 0;
    toast.mockClear();
    saveOldDraft();
  });

  it("replaces the tier kept in a saved draft", async () => {
    renderDialog();
    expect(await screen.findByText("Remise café au kg −10 %")).toBeInTheDocument();
    expect(screen.getByText("Amulette")).toBeInTheDocument();
    expect(screen.queryByText("30 kilos")).not.toBeInTheDocument();
  });

  it("does not create the order if the tier changed after the form loaded", async () => {
    renderDialog();
    await screen.findByText("Remise café au kg −10 %");
    db.tier = { ...AMULETTE, name: "+100 kilos", kg_discount_percent: 15, bag_discount_percent: 15, volume_threshold_kg: null, volume_kg_discount_percent: null };
    fireEvent.click(screen.getByRole("button", { name: /Create Order/ }));
    expect(await screen.findByText("Remise café au kg −15 %")).toBeInTheDocument();
    expect(db.orderInserts).toHaveLength(0);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Le palier du client a changé" }));
  });

  it("refuses to create the order when the tier cannot be loaded", async () => {
    db.tierError = { message: "network" };
    renderDialog();
    const save = await screen.findByRole("button", { name: /Create Order/ });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Impossible de charger le palier du client" })));
    fireEvent.click(save);
    await waitFor(() => expect(toast.mock.calls.length).toBeGreaterThan(1));
    expect(db.orderInserts).toHaveLength(0);
  });
});
