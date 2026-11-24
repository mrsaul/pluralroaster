import { format, addDays } from "date-fns";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoasterOrder } from "@/components/RoasterView";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

let inputsState: { data?: unknown; error: Error | null; isLoading: boolean } = { error: null, isLoading: false };
const inputsData = {
  stockKg: { br: 70, ca: 7 },
  productPercent: { br: 17 },
  defaultPercent: 15,
  productNames: { gh: "Colombie – Golden Huila", br: "Brésil", ca: "Colombie – Cauca" },
};

vi.mock("@/hooks/useRoasting", () => ({
  useRoastingInputs: () => inputsState,
  useAddRoastedStock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSetGreenPercent: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSetDefaultGreenPercent: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import { RoasterView } from "@/components/RoasterView";

// Radix Select needs these in jsdom.
Element.prototype.scrollIntoView ??= vi.fn();
Element.prototype.hasPointerCapture ??= vi.fn(() => false);
Element.prototype.releasePointerCapture ??= vi.fn();

const order = (
  id: string,
  client: string,
  status: RoasterOrder["status"],
  is_packed: boolean,
  items: RoasterOrder["items"],
): RoasterOrder => ({
  id,
  client_name: client,
  delivery_date: "2030-01-10",
  total_kg: 0,
  status,
  is_roasted: false,
  is_packed,
  items,
});

const orders: RoasterOrder[] = [
  order("o1", "Café A", "approved", false, [
    { product_id: "gh", product_name: "Golden Huila", quantity: 30, kind: "coffee" },
    { product_id: "sv", product_name: "Livraison", quantity: 1, kind: "service" },
  ]),
  order("o2", "Café B", "packaging", true, [{ product_id: "br", product_name: "Brésil", quantity: 40, kind: "coffee" }]),
  order("o3", "Café C", "received", false, [{ product_id: "br", product_name: "Brésil", quantity: 85, kind: "coffee" }]),
  order("o4", "Café D", "approved", false, [{ product_id: "ca", product_name: "Cauca", quantity: 5, kind: "coffee" }]),
];

const renderView = (onMarkRoasted = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RoasterView orders={orders} onMarkRoasted={onMarkRoasted} />
    </QueryClientProvider>,
  );
  return onMarkRoasted;
};

const card = (label: string) => screen.getByText(label).parentElement as HTMLElement;

describe("RoasterView", () => {
  beforeEach(() => {
    inputsState = { data: inputsData, error: null, isLoading: false };
  });

  it("shows kilos after stock and green weight in the stats", () => {
    renderView();
    expect(within(card("À torréfier")).getByText("45.00 kg")).toBeInTheDocument();
    expect(within(card("Vert à peser")).getByText("52.05 kg")).toBeInTheDocument();
  });

  it("shows kilos to roast per coffee with the Torréfié button, and covered coffees without it", () => {
    renderView();
    expect(screen.getByText("30.00 kg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Torréfié Colombie – Golden Huila" })).toBeInTheDocument();
    expect(screen.getByText("Couvert par le stock")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Torréfié Colombie – Cauca" })).not.toBeInTheDocument();
  });

  it("ignores packed orders and received orders count (Brésil needs 85, not 125)", () => {
    renderView();
    // 85 - 70 = 15 to roast, green 17.55
    expect(screen.getByText("15.00 kg")).toBeInTheDocument();
    expect(screen.getByText("17.55 kg")).toBeInTheDocument();
  });

  it("received orders are 'À valider' without a packaging button; approved ones move on", () => {
    const onMark = renderView();
    fireEvent.click(screen.getByText("Brésil"));
    expect(screen.getByText("À valider")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Passer en conditionnement" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Colombie – Golden Huila"));
    fireEvent.click(screen.getByRole("button", { name: "Passer en conditionnement" }));
    expect(onMark).toHaveBeenCalledWith("o1", true);
  });

  it("counts distinct orders per coffee and sums an order's lines of that coffee", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RoasterView
          orders={[
            order("o9", "Café Z", "approved", false, [
              { product_id: "gh", product_name: "Golden Huila", quantity: 2, kind: "coffee" },
              { product_id: "gh", product_name: "Golden Huila", quantity: 3.5, kind: "coffee" },
              { product_id: null as unknown as string, product_name: "Ancien café", quantity: 4, kind: "coffee" },
            ]),
          ]}
          onMarkRoasted={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("1 commande")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Colombie – Golden Huila"));
    expect(screen.getAllByText("Café Z")).toHaveLength(1);
    expect(screen.getByText("5.50 kg", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Ancien café")).not.toBeInTheDocument();
  });

  it("default filter (Toutes les dates) nets stock against every open order", () => {
    const day = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");
    const dated = (o: RoasterOrder, d: string): RoasterOrder => ({ ...o, delivery_date: d });
    inputsState = { data: { ...inputsData, stockKg: { br: 10 } }, error: null, isLoading: false };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RoasterView
          orders={[
            dated(order("t1", "Café T", "approved", false, [{ product_id: "br", product_name: "Brésil", quantity: 10, kind: "coffee" }]), day(0)),
            dated(order("t2", "Café U", "approved", false, [{ product_id: "br", product_name: "Brésil", quantity: 5, kind: "coffee" }]), day(1)),
          ]}
          onMarkRoasted={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Toutes les dates");
    expect(screen.queryByText("Couvert par le stock")).not.toBeInTheDocument();
    expect(within(card("À torréfier")).getByText("5.00 kg")).toBeInTheDocument();
  });

  it("Jusqu'à demain counts today's and tomorrow's orders against stock (5.00 kg, not covered)", () => {
    const day = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");
    const dated = (o: RoasterOrder, d: string): RoasterOrder => ({ ...o, delivery_date: d });
    inputsState = { data: { ...inputsData, stockKg: { br: 10 } }, error: null, isLoading: false };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RoasterView
          orders={[
            dated(order("t0", "Café S", "approved", false, [{ product_id: "br", product_name: "Brésil", quantity: 7, kind: "coffee" }]), day(5)),
            dated(order("t1", "Café T", "approved", false, [{ product_id: "br", product_name: "Brésil", quantity: 10, kind: "coffee" }]), day(0)),
            dated(order("t2", "Café U", "approved", false, [{ product_id: "br", product_name: "Brésil", quantity: 5, kind: "coffee" }]), day(1)),
          ]}
          onMarkRoasted={vi.fn()}
        />
      </QueryClientProvider>,
    );
    // All dates: 22 − 10 = 12
    expect(within(card("À torréfier")).getByText("12.00 kg")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Jusqu'à demain" }));
    expect(screen.getByRole("combobox")).toHaveTextContent("Jusqu'à demain");
    expect(screen.queryByText("Couvert par le stock")).not.toBeInTheDocument();
    expect(within(card("À torréfier")).getByText("5.00 kg")).toBeInTheDocument();
  });

  it("shows loading and error states", () => {
    inputsState = { data: undefined, error: null, isLoading: true };
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <RoasterView orders={orders} onMarkRoasted={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Calcul en cours…")).toBeInTheDocument();
    unmount();
    inputsState = { data: undefined, error: new Error("boom"), isLoading: false };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RoasterView orders={orders} onMarkRoasted={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Impossible de calculer le torréfié : boom")).toBeInTheDocument();
  });
});
