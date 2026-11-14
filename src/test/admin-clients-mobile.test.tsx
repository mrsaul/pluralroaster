import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { AppClient } from "@/components/AdminClientDetail";

// Chainable Supabase stub: every query method returns the chain; awaiting it resolves
// with the rows registered for the table.
const tableRows: Record<string, unknown[]> = {};
vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const result = { data: tableRows[table] ?? [], error: null };
    const c: any = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
          return () => c;
        },
      },
    );
    return c;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      functions: { invoke: vi.fn() },
    },
  };
});

import { AdminClientsSection } from "@/components/AdminClientsSection";
import { AdminClientDetail } from "@/components/AdminClientDetail";

function client(overrides: Partial<AppClient> = {}): AppClient {
  return {
    id: "c1",
    user_id: "u1",
    company_name: "AMULETTE CAFÉ-RESTAURANT DE QUARTIER",
    contact_name: "Camille Dupont",
    email: "camille@amulette.example",
    phone: null,
    delivery_address: "12 rue des Petites-Écuries, 75010 Paris",
    pricing_tier: "100 kilos",
    pricing_tier_id: null,
    free_delivery: false,
    sellsy_client_id: "208",
    onboarding_status: "completed",
    client_data_mode: "sellsy",
    custom_company_name: null,
    custom_contact_name: null,
    custom_email: null,
    custom_phone: null,
    custom_delivery_address: null,
    custom_pricing_tier: null,
    last_synced_at: "2026-11-10T09:30:00Z",
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-11-10T09:30:00Z",
    ...overrides,
  };
}

describe("Clients list on phones", () => {
  it("shows each client as a tappable card that opens the client", () => {
    const onSelect = vi.fn();
    const clients = [client(), client({ id: "c2", company_name: "ZAÏA", contact_name: "Léa" })];
    render(<AdminClientsSection clients={clients} loading={false} error={null} onSelectClient={onSelect} />);

    const list = screen.getByRole("list", { name: "Clients" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("AMULETTE CAFÉ-RESTAURANT DE QUARTIER")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Camille Dupont")).toBeInTheDocument();
    expect(within(cards[0]).getByText("100 kilos")).toBeInTheDocument();

    fireEvent.click(within(cards[1]).getByRole("button", { name: /ZAÏA/ }));
    expect(onSelect).toHaveBeenCalledWith(clients[1]);
  });

  it("keeps the table for wide screens only and the cards for phones only", () => {
    render(<AdminClientsSection clients={[client()]} loading={false} error={null} onSelectClient={vi.fn()} />);
    expect(screen.getByRole("list", { name: "Clients" }).className).toMatch(/\bmd:hidden\b/);
    expect(screen.getByRole("table").closest("[data-clients-table]")?.className).toMatch(/\bhidden\b.*\bmd:block\b/);
  });

  it("gives the search field the full width on phones", () => {
    render(<AdminClientsSection clients={[client()]} loading={false} error={null} onSelectClient={vi.fn()} />);
    const searchBox = screen.getByPlaceholderText("Rechercher un client…").parentElement!;
    expect(searchBox.className).toMatch(/\bw-full\b/);
    expect(searchBox.className).toMatch(/\bsm:w-56\b/);
  });
});

describe("Client window on phones", () => {
  beforeEach(() => {
    tableRows.contacts = [{ user_id: "u1" }];
    tableRows.pricing_tiers = [];
    tableRows.orders = [
      {
        id: "abcdef12-0000-0000-0000-000000000000",
        created_at: "2026-09-22T10:14:00Z",
        delivery_date: "2026-09-24",
        status: "received",
        total_kg: 30,
        total_price: 767.4,
        sellsy_id: null,
        order_items: [],
      },
    ];
  });

  it("cannot be pushed wider than the screen by a long line", async () => {
    render(<AdminClientDetail client={client()} open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    // A grid track sized minmax(0,1fr) lets children shrink instead of widening the dialog.
    expect(screen.getByRole("dialog").className).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/);
  });

  it("wraps an order's weight and amount instead of forcing one long line", async () => {
    render(<AdminClientDetail client={client()} open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    const row = await screen.findByRole("button", { name: /#ABCDEF12/ });
    expect(row.className).toMatch(/\bflex-wrap\b/);
    expect(within(row).getByText("€767.40 HT")).toBeInTheDocument();
  });

  it("lets the Sellsy sync line wrap under the date", async () => {
    render(<AdminClientDetail client={client()} open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    const syncButton = await screen.findByRole("button", { name: /Synchroniser depuis Sellsy/ });
    expect(syncButton.parentElement!.className).toMatch(/\bflex-wrap\b/);
  });

  it("keeps Annuler / Enregistrer visible at the bottom while scrolling", async () => {
    render(<AdminClientDetail client={client()} open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    const save = await screen.findByRole("button", { name: "Enregistrer" });
    expect(save.parentElement!.className).toMatch(/\bsticky\b/);
    expect(save.parentElement!.className).toMatch(/\bbottom-0\b/);
  });
});
