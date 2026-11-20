import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";

const writes: { op: string; payload: any }[] = [];
const tiers = [
  { id: "t1", name: "AMULETTE", description: null, product_discount_percent: 5, delivery_discount_percent: 100,
    kg_discount_percent: 5, bag_discount_percent: 5, volume_threshold_kg: 20, volume_kg_discount_percent: 10, is_active: true },
  { id: "t2", name: "Rien", description: null, product_discount_percent: 0, delivery_discount_percent: 0,
    kg_discount_percent: 0, bag_discount_percent: 0, volume_threshold_kg: null, volume_kg_discount_percent: null, is_active: true },
];
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tiers, error: null }).then(resolve);
      if (prop === "insert" || prop === "update") return (payload: unknown) => { writes.push({ op: String(prop), payload }); return chain; };
      return () => chain;
    },
  });
  return { supabase: { from: () => chain, auth: { getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) } } };
});

import { PricingTiersView } from "@/components/PricingTiersView";

const SUMMARY = "Café au kg −5 % · dès 20 kg −10 % · sachets −5 %";

beforeEach(() => { writes.length = 0; localStorage.clear(); });

async function openCreate() {
  render(<PricingTiersView />);
  await screen.findByRole("list", { name: "Paliers tarifaires" });
  fireEvent.click(screen.getByRole("button", { name: /Nouveau palier/ }));
  return screen.findByRole("dialog");
}
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

describe("Tarifs summaries", () => {
  it("shows the rules summary on cards and in the table, never delivery", async () => {
    render(<PricingTiersView />);
    const list = await screen.findByRole("list", { name: "Paliers tarifaires" });
    const cards = within(list).getAllByRole("listitem");
    expect(within(cards[0]).getByText(SUMMARY)).toBeInTheDocument();
    expect(within(cards[1]).getByText("Aucune remise")).toBeInTheDocument();
    expect(screen.getAllByText(SUMMARY)).toHaveLength(2); // card + table row
    expect(screen.queryByText(/livraison/i)).toBeNull();
  });
});

describe("Tarifs form", () => {
  it("has the four rate fields and no delivery field", async () => {
    const dialog = await openCreate();
    for (const l of ["Remise café au kg (%)", "Remise sachets (%)", "À partir de (kg)", "Remise au kg au-delà (%)"]) {
      expect(within(dialog).getByLabelText(l)).toBeInTheDocument();
    }
    expect(within(dialog).queryByText(/livraison/i)).toBeNull();
  });

  it("saves AMULETTE rules and keeps product_discount_percent = kg rate", async () => {
    const dialog = await openCreate();
    type(within(dialog).getByPlaceholderText("ex. Palier VIP"), "AMULETTE");
    type(within(dialog).getByLabelText("Remise café au kg (%)"), "5");
    type(within(dialog).getByLabelText("Remise sachets (%)"), "5");
    type(within(dialog).getByLabelText("À partir de (kg)"), "20");
    type(within(dialog).getByLabelText("Remise au kg au-delà (%)"), "10");
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le palier" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].payload).toMatchObject({
      name: "AMULETTE", kg_discount_percent: 5, bag_discount_percent: 5,
      volume_threshold_kg: 20, volume_kg_discount_percent: 10, product_discount_percent: 5,
    });
    expect(writes[0].payload).not.toHaveProperty("delivery_discount_percent");
  });

  it("saves null step when both step fields are empty", async () => {
    const dialog = await openCreate();
    type(within(dialog).getByPlaceholderText("ex. Palier VIP"), "Simple");
    type(within(dialog).getByLabelText("Remise café au kg (%)"), "3");
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le palier" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].payload).toMatchObject({ volume_threshold_kg: null, volume_kg_discount_percent: null, bag_discount_percent: 0 });
  });

  it.each([
    ["threshold without rate", "20", ""],
    ["rate without threshold", "", "10"],
  ])("blocks save with an inline error: %s", async (_n, thr, rate) => {
    const dialog = await openCreate();
    type(within(dialog).getByPlaceholderText("ex. Palier VIP"), "X");
    type(within(dialog).getByLabelText("À partir de (kg)"), thr);
    type(within(dialog).getByLabelText("Remise au kg au-delà (%)"), rate);
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le palier" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/seuil.*remise|remise.*seuil/i);
    expect(writes).toHaveLength(0);
  });

  it("rejects a zero threshold", async () => {
    const dialog = await openCreate();
    type(within(dialog).getByPlaceholderText("ex. Palier VIP"), "X");
    type(within(dialog).getByLabelText("À partir de (kg)"), "0");
    type(within(dialog).getByLabelText("Remise au kg au-delà (%)"), "10");
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le palier" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it("rejects a volume step that is not above the kg rate", async () => {
    const dialog = await openCreate();
    type(within(dialog).getByPlaceholderText("ex. Palier VIP"), "X");
    type(within(dialog).getByLabelText("Remise café au kg (%)"), "10");
    type(within(dialog).getByLabelText("À partir de (kg)"), "20");
    type(within(dialog).getByLabelText("Remise au kg au-delà (%)"), "10");
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le palier" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("La remise au-delà doit être supérieure à la remise café au kg");
    expect(writes).toHaveLength(0);
  });

  it("keeps the tier's rates when restoring a draft saved before the rules existed", async () => {
    localStorage.setItem("draft:pricing-tier-edit:t3:__anon__", JSON.stringify({
      savedAt: "2026-11-01T10:00:00Z",
      data: { name: "Ancien", description: "", productDiscount: "10", deliveryDiscount: 0, isActive: true },
    }));
    tiers.push({ id: "t3", name: "Ancien", description: null, product_discount_percent: 10, delivery_discount_percent: 0,
      kg_discount_percent: null, bag_discount_percent: null, volume_threshold_kg: null, volume_kg_discount_percent: null, is_active: true } as any);
    try {
      render(<PricingTiersView />);
      await screen.findByRole("list", { name: "Paliers tarifaires" });
      fireEvent.click(screen.getAllByRole("button", { name: "Modifier Ancien" })[0]);
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
      await waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0].payload).toMatchObject({ kg_discount_percent: 10, bag_discount_percent: 10, product_discount_percent: 10 });
    } finally {
      tiers.pop();
    }
  });

  it("shows a rate range error next to the rate fields, not in the step box", async () => {
    const dialog = await openCreate();
    type(within(dialog).getByPlaceholderText("ex. Palier VIP"), "X");
    type(within(dialog).getByLabelText("Remise café au kg (%)"), "150");
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le palier" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(/0 et 100/);
    expect(alert.closest("[data-step-box]")).toBeNull();
    expect(writes).toHaveLength(0);
  });
});
