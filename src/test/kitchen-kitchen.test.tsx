import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { products, item, order } from "./kitchen-fixtures";
import type { KitchenOrder } from "@/kitchen/types";

const occ = (roundId: string, productionDate: string, cutoffAt: string, capacityMinutes: number) =>
  ({ roundId, roundName: roundId, productionDate, cutoffAt, capacityMinutes });
const OCCURRENCES = [
  occ("r2", "2026-10-30", "2026-10-29T19:00:00Z", 300),
  occ("r1", "2026-11-03", "2026-11-02T19:00:00Z", 360),
  occ("r2", "2026-11-06", "2026-11-05T19:00:00Z", 300),
  occ("r1", "2026-11-10", "2026-11-09T19:00:00Z", 360),
];
const ROUNDS = [
  { id: "r1", name: "Mardi", productionWeekday: 2, cutoffWeekday: 0, cutoffTime: "20:00", capacityMinutes: 360, isActive: true },
  { id: "r2", name: "Vendredi", productionWeekday: 5, cutoffWeekday: 3, cutoffTime: "20:00", capacityMinutes: 300, isActive: true },
];

const mocks = vi.hoisted(() => ({
  now: new Date("2026-11-04T10:00:00Z"), // Wednesday -> default round Vendredi 6 nov.
  orders: [] as KitchenOrder[],
  updateProduct: vi.fn(),
  createProduct: vi.fn(),
  updateSettings: vi.fn(),
  upsertRound: vi.fn(),
  deleteRound: vi.fn(),
  markReady: vi.fn(),
  setEta: vi.fn(),
  dates: [] as (string | undefined)[],
  loading: false,
  error: false,
}));

vi.mock("@/kitchen/api", () => ({
  useKitchenProducts: () => ({ data: products }),
  useKitchenRounds: () => ({ data: ROUNDS }),
  useRoundOccurrences: () => (mocks.loading ? { data: undefined, isLoading: true, isError: false }
    : mocks.error ? { data: undefined, isLoading: false, isError: true }
    : { data: OCCURRENCES, isLoading: false, isError: false }),
  useKitchenSettings: () => ({ data: { reminderHoursBefore: 24 } }),
  useKitchenOrders: (f: { productionDate?: string }) => { mocks.dates.push(f.productionDate); return { data: mocks.orders }; },
  useUpdateProduct: () => ({ mutate: mocks.updateProduct, isPending: false }),
  useCreateProduct: () => ({ mutate: mocks.createProduct, isPending: false }),
  useUpdateSettings: () => ({ mutate: mocks.updateSettings, isPending: false }),
  useUpsertRound: () => ({ mutate: mocks.upsertRound, isPending: false }),
  useDeleteRound: () => ({ mutate: mocks.deleteRound, isPending: false }),
  useMarkReady: () => ({ mutate: mocks.markReady, isPending: false }),
  useSetReadyEta: () => ({ mutate: mocks.setEta, isPending: false }),
  kitchenErrorMessage: (e: { message?: string }) => (e?.message === "round_in_use" ? "ROUND_IN_USE_MSG" : "err"),
}));

vi.mock("@/kitchen/cafe/useNow", async (orig) => ({
  ...(await orig<typeof import("@/kitchen/cafe/useNow")>()),
  useNow: () => mocks.now,
}));

import ProductionView from "@/kitchen/kitchen/ProductionView";
import KitchenOrdersList from "@/kitchen/kitchen/KitchenOrdersList";
import ProductsEditor from "@/kitchen/kitchen/ProductsEditor";
import KitchenSettings from "@/kitchen/kitchen/KitchenSettings";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockReset());
  mocks.dates = [];
  mocks.loading = false;
  mocks.error = false;
  mocks.now = new Date("2026-11-04T10:00:00Z");
  mocks.orders = [
    order({ cafeId: "c1", cafeName: "Artivistas", items: [item("p1", 1)] }),
    order({ cafeId: "c2", cafeName: "Nouveau café", items: [item("p1", 2)] }),
  ];
});

describe("kitchen default round", () => {
  for (const [name, View] of [["ProductionView", ProductionView], ["KitchenOrdersList", KitchenOrdersList]] as const) {
    it(`${name} defaults to the next round not yet produced and 'Prochaine' returns to it`, () => {
      render(<View />);
      expect(screen.getByText("Production du vendredi 6 nov.")).toBeInTheDocument();
      expect(mocks.dates[mocks.dates.length - 1]).toBe("2026-11-06");
      fireEvent.click(screen.getByRole("button", { name: "Tournée suivante" }));
      expect(screen.getByText("Production du mardi 10 nov.")).toBeInTheDocument();
      expect(mocks.dates[mocks.dates.length - 1]).toBe("2026-11-10");
      fireEvent.click(screen.getByRole("button", { name: "Prochaine" }));
      expect(screen.getByText("Production du vendredi 6 nov.")).toBeInTheDocument();
    });
  }
  it("on the production day itself the round is still the default", () => {
    mocks.now = new Date("2026-11-03T08:00:00Z");
    render(<ProductionView />);
    expect(screen.getByText("Production du mardi 3 nov.")).toBeInTheDocument();
  });
});

describe("round loading state", () => {
  for (const [name, View] of [["ProductionView", ProductionView], ["KitchenOrdersList", KitchenOrdersList]] as const) {
    it(`${name} shows the loading text, not « Aucune tournée », while occurrences load`, () => {
      mocks.loading = true;
      render(<View />);
      expect(screen.getByText("Chargement…")).toBeInTheDocument();
      expect(screen.queryByText(/Aucune tournée/)).not.toBeInTheDocument();
    });
    it(`${name} shows an error, not « Aucune tournée », when occurrences fail to load`, () => {
      mocks.error = true;
      render(<View />);
      expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger les tournées. Réessayez plus tard.");
      expect(screen.queryByText(/Aucune tournée/)).not.toBeInTheDocument();
    });
  }
});

describe("ProductionView", () => {
  it("shows the pandebono row with to-produce 2 and the per-café breakdown", () => {
    render(<ProductionView />);
    expect(screen.getByText("Pandebono")).toBeInTheDocument();
    expect(screen.getByText("Artivistas 1 · Nouveau café 2")).toBeInTheDocument();
    expect(screen.getByTestId("to-produce-p1")).toHaveTextContent("2");
    expect(screen.getByTestId("to-produce-p1")).toHaveTextContent("100 pcs");
  });
  it("measures capacity against the selected round's hours", () => {
    render(<ProductionView />);
    expect(screen.getByText(/5 h/)).toBeInTheDocument(); // Vendredi: 300 min
    fireEvent.click(screen.getByRole("button", { name: "Tournée suivante" }));
    expect(screen.getByText(/6 h/)).toBeInTheDocument(); // Mardi: 360 min
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

describe("KitchenOrdersList long names", () => {
  it("long names wrap instead of overflowing", () => {
    mocks.orders = [order({ id: "l", cafeId: "c1", cafeName: "Nouveau café de la Villette – comptoir", items: [item("p1", 3)] })];
    render(<KitchenOrdersList />);
    expect(screen.getByTestId("order-cafe").className).toMatch(/break-words|min-w-0/);
  });
});

describe("ProductsEditor", () => {
  it("never goes below 0 stock", () => {
    render(<ProductsEditor />);
    const card = screen.getByTestId("product-p2");
    fireEvent.click(within(card).getByLabelText("Diminuer la quantité"));
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
  it("lists the rounds Monday-first with their days", () => {
    render(<KitchenSettings />);
    const items = screen.getAllByTestId(/^round-/);
    expect(items.map((e) => e.getAttribute("data-testid"))).toEqual(["round-r1", "round-r2"]);
    expect(items[0]).toHaveTextContent("Mardi");
    expect(items[1]).toHaveTextContent("Vendredi");
  });
  const edit = (id: string) => {
    fireEvent.click(within(screen.getByTestId(`round-${id}`)).getByRole("button", { name: "Modifier" }));
    return screen.getByTestId(`round-${id}`);
  };
  it("saves 6 h as 360 minutes", () => {
    render(<KitchenSettings />);
    const card = edit("r1");
    fireEvent.change(within(card).getByLabelText("Heures d'équipe"), { target: { value: "6" } });
    fireEvent.click(within(card).getByRole("button", { name: "Enregistrer" }));
    expect(mocks.upsertRound).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r1", name: "Mardi", productionWeekday: 2, cutoffWeekday: 0, cutoffTime: "20:00", capacityMinutes: 360, isActive: true }),
      expect.anything(),
    );
  });
  it("refuses 0 hours", () => {
    render(<KitchenSettings />);
    const card = edit("r1");
    fireEvent.change(within(card).getByLabelText("Heures d'équipe"), { target: { value: "0" } });
    fireEvent.click(within(card).getByRole("button", { name: "Enregistrer" }));
    expect(mocks.upsertRound).not.toHaveBeenCalled();
    expect(within(card).getByRole("alert")).toBeInTheDocument();
  });
  it("refuses an empty name", () => {
    render(<KitchenSettings />);
    const card = edit("r1");
    fireEvent.change(within(card).getByLabelText("Nom de la tournée"), { target: { value: " " } });
    fireEvent.click(within(card).getByRole("button", { name: "Enregistrer" }));
    expect(mocks.upsertRound).not.toHaveBeenCalled();
    expect(within(card).getByRole("alert")).toHaveTextContent("obligatoire");
  });
  it("refuses a second round on the same production day", () => {
    render(<KitchenSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une tournée" }));
    const form = screen.getByTestId("round-new");
    fireEvent.change(within(form).getByLabelText("Nom de la tournée"), { target: { value: "Autre mardi" } });
    fireEvent.change(within(form).getByLabelText("Jour de production"), { target: { value: "2" } });
    fireEvent.click(within(form).getByRole("button", { name: "Enregistrer" }));
    expect(mocks.upsertRound).not.toHaveBeenCalled();
    expect(within(form).getByRole("alert")).toHaveTextContent("Une tournée existe déjà ce jour-là.");
  });
  it("maps a server unique violation to the same message", () => {
    mocks.upsertRound.mockImplementation((_v, o) => o.onError({ code: "23505", message: "duplicate key" }));
    render(<KitchenSettings />);
    const card = edit("r1");
    fireEvent.click(within(card).getByRole("button", { name: "Enregistrer" }));
    expect(within(card).getByRole("alert")).toHaveTextContent("Une tournée existe déjà ce jour-là.");
  });
  it("shows the round_in_use message when changing the production day is refused", () => {
    mocks.upsertRound.mockImplementation((_v, o) => o.onError({ message: "round_in_use" }));
    render(<KitchenSettings />);
    const card = edit("r1");
    fireEvent.change(within(card).getByLabelText("Jour de production"), { target: { value: "3" } });
    fireEvent.click(within(card).getByRole("button", { name: "Enregistrer" }));
    expect(within(card).getByRole("alert")).toHaveTextContent("ROUND_IN_USE_MSG");
  });
  it("shows the round_in_use message when deleting is refused", () => {
    mocks.deleteRound.mockImplementation((_v, o) => o.onError({ message: "round_in_use" }));
    render(<KitchenSettings />);
    fireEvent.click(within(screen.getByTestId("round-r1")).getByRole("button", { name: "Supprimer" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Supprimer" }));
    expect(mocks.deleteRound).toHaveBeenCalledWith({ id: "r1" }, expect.anything());
    expect(screen.getByRole("alert")).toHaveTextContent("ROUND_IN_USE_MSG");
  });
  it("round-trips the reminder hours and refuses > 48", () => {
    render(<KitchenSettings />);
    const input = screen.getByLabelText("Rappel avant la date limite (heures)") as HTMLInputElement;
    expect(input.value).toBe("24");
    fireEvent.change(input, { target: { value: "49" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le rappel" }));
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le rappel" }));
    expect(mocks.updateSettings).toHaveBeenCalledWith({ reminderHoursBefore: 12 }, expect.anything());
  });
});
