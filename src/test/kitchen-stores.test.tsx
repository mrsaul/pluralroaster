import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { products, item, order } from "./kitchen-fixtures";
import type { KitchenOrder } from "@/kitchen/types";

// Default moment: Mon 2 Nov 2026 21:30 Paris, after the Tuesday 3 Nov cutoff -> default round Mardi 3 nov.
const occ = (productionDate: string, cutoffAt: string, capacityMinutes: number) =>
  ({ roundId: "r1", roundName: "Round", productionDate, cutoffAt, capacityMinutes });
const OCCURRENCES = [
  occ("2026-10-27", "2026-10-26T19:00:00Z", 360),
  occ("2026-10-30", "2026-10-29T19:00:00Z", 300),
  occ("2026-11-03", "2026-11-02T19:00:00Z", 360),
  occ("2026-11-06", "2026-11-05T19:00:00Z", 300),
  occ("2026-11-10", "2026-11-09T19:00:00Z", 360),
];
const mocks = vi.hoisted(() => ({
  now: new Date("2026-11-02T20:30:00Z"),
  occurrences: [] as { roundId: string; roundName: string; productionDate: string; cutoffAt: string; capacityMinutes: number }[],
  createUrgent: vi.fn(),
  notify: vi.fn(),
  weekly: [] as KitchenOrder[],
  urgent: [] as KitchenOrder[],
  cafes: [] as { id: string; name: string; isActive?: boolean }[],
  lock: vi.fn(),
  unlock: vi.fn(),
  create: vi.fn(),
  adjust: vi.fn(),
  approve: vi.fn(),
  decline: vi.fn(),
  extra: [] as KitchenOrder[],
}));

vi.mock("@/kitchen/api", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });
  return {
    useKitchenProducts: () => ({ data: products }),
    useRoundOccurrences: () => ({ data: mocks.occurrences }),
    useKitchenCafes: () => ({ data: mocks.cafes }),
    useKitchenOrders: (f: { kind?: string; productionDate?: string; from?: string; to?: string }) => ({
      data: [...mocks.weekly, ...mocks.urgent, ...mocks.extra].filter((o) =>
        (!f.kind || o.kind === f.kind) && (!f.productionDate || o.productionDate === f.productionDate) &&
        (!f.from || o.productionDate >= f.from) && (!f.to || o.productionDate <= f.to)),
    }),
    useCreateUrgentOrder: () => ({ mutate: mocks.createUrgent, isPending: false }),
    useLockOrder: () => ({ mutate: mocks.lock, mutateAsync: mocks.lock }),
    useUnlockOrder: () => ({ mutate: mocks.unlock }),
    useCreateOrderForCafe: () => ({ mutate: mocks.create, isPending: false }),
    useAdjustItem: () => ({ mutate: vi.fn(), mutateAsync: mocks.adjust }),
    useApproveOrder: () => ({ mutate: mocks.approve, isPending: false }),
    useDeclineOrder: () => ({ mutate: mocks.decline, isPending: false }),
    useSetItem: mut, useSendOrder: mut,
    kitchenErrorMessage: () => "err",
    notifyKitchen: mocks.notify,
  };
});

vi.mock("@/kitchen/cafe/useNow", async (orig) => ({
  ...(await orig<typeof import("@/kitchen/cafe/useNow")>()),
  useNow: () => mocks.now,
}));

import CapacityBar from "@/kitchen/stores/CapacityBar";
import StoresReview from "@/kitchen/stores/StoresReview";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  mocks.now = new Date("2026-11-02T20:30:00Z");
  mocks.occurrences = OCCURRENCES;
  mocks.createUrgent.mockReset(); mocks.notify.mockReset();
  mocks.weekly = []; mocks.urgent = []; mocks.extra = [];
  mocks.cafes = [{ id: "c1", name: "Artivistas", isActive: true }, { id: "c2", name: "Belleville", isActive: true }];
  mocks.lock.mockReset().mockResolvedValue(undefined); mocks.unlock.mockClear(); mocks.create.mockClear();
  mocks.adjust.mockReset().mockResolvedValue(undefined); mocks.approve.mockReset(); mocks.decline.mockReset();
});

describe("CapacityBar", () => {
  it("is red with an over-by message when needed exceeds available", () => {
    const { container } = render(<CapacityBar neededMinutes={240} availableMinutes={180} />);
    expect(screen.getByText(/1 h/, { selector: "p" })).toBeInTheDocument();
    expect(container.querySelector('[data-over="true"]')).not.toBeNull();
  });
  it("shows no over text when within capacity", () => {
    const { container } = render(<CapacityBar neededMinutes={120} availableMinutes={180} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector('[data-over="true"]')).toBeNull();
  });
});

describe("StoresReview", () => {
  it("renders urgent orders above weekly ones", () => {
    mocks.weekly = [order({ cafeId: "c2", cafeName: "Belleville", status: "sent", items: [item("p1", 1)] })];
    mocks.urgent = [order({ cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "sent", neededBy: "2026-11-03T08:00:00Z", items: [item("p1", 1)] })];
    render(<StoresReview />);
    const urgent = screen.getByText("Urgences en attente");
    const review = screen.getByText("À examiner");
    expect(urgent.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists a café without a sent order under not-sent with a create button", () => {
    mocks.weekly = [order({ cafeId: "c2", cafeName: "Belleville", status: "sent", items: [item("p1", 1)] })];
    render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Créer la commande pour ce café" }));
    expect(mocks.create).toHaveBeenCalledWith({ cafeId: "c1", productionDate: "2026-11-03" }, expect.anything());
  });

  it("locks on open and unlocks on unmount", async () => {
    mocks.weekly = [order({ id: "ord1", cafeId: "c2", cafeName: "Belleville", status: "sent", items: [item("p1", 1)] })];
    const { unmount } = render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
    expect(mocks.lock).toHaveBeenCalledWith({ orderId: "ord1" });
    await act(async () => {});
    unmount();
    await act(async () => {});
    expect(mocks.unlock).toHaveBeenCalledWith({ orderId: "ord1" });
  });

  it("flags sent-but-unapproved and unsent cafés after cutoff, and shows urgent counts", () => {
    mocks.weekly = [order({ cafeId: "c2", cafeName: "Belleville", status: "sent", items: [item("p1", 1)] })];
    mocks.urgent = [
      order({ cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "approved", productionDate: "2026-10-27", items: [item("p1", 1)] }),
      order({ cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "declined", productionDate: "2026-08-15", items: [item("p1", 1)] }),
    ];
    render(<StoresReview />);
    expect(screen.getByText("Production du mardi 3 nov.")).toBeInTheDocument();
    expect(screen.getByText("Non approuvée, non comptée par la cuisine")).toBeInTheDocument();
    expect(screen.getByText("Non envoyée")).toBeInTheDocument();
    expect(screen.getByText(/: 1$/)).toBeInTheDocument(); // the 15 Aug one is older than 8 weeks
  });

  it("does not flag anything before the round's cutoff", () => {
    mocks.now = new Date("2026-11-04T10:00:00Z"); // Wed: Fri 6 still open
    render(<StoresReview />);
    expect(screen.getByText("Production du vendredi 6 nov.")).toBeInTheDocument();
    expect(screen.queryByText("Non envoyée")).toBeNull();
  });

  describe("default round", () => {
    it("Monday 21:30: the Tuesday round", () => {
      render(<StoresReview />);
      expect(screen.getByText("Production du mardi 3 nov.")).toBeInTheDocument();
    });
    it("Wednesday: the Friday round", () => {
      mocks.now = new Date("2026-11-04T10:00:00Z");
      render(<StoresReview />);
      expect(screen.getByText("Production du vendredi 6 nov.")).toBeInTheDocument();
    });
  });

  describe("round picker", () => {
    it("steps previous/next and returns to the default with Prochaine", () => {
      render(<StoresReview />);
      expect(screen.queryByRole("button", { name: "Prochaine" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Tour suivant" }));
      expect(screen.getByText("Production du vendredi 6 nov.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Tour précédent" }));
      fireEvent.click(screen.getByRole("button", { name: "Tour précédent" }));
      expect(screen.getByText("Production du vendredi 30 oct.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Prochaine" }));
      expect(screen.getByText("Production du mardi 3 nov.")).toBeInTheDocument();
    });
    it("keeps the picked round when the list changes", () => {
      const { rerender } = render(<StoresReview />);
      fireEvent.click(screen.getByRole("button", { name: "Tour suivant" }));
      mocks.occurrences = OCCURRENCES.slice(1);
      rerender(<QueryClientProvider client={new QueryClient()}><StoresReview /></QueryClientProvider>);
      expect(screen.getByText("Production du vendredi 6 nov.")).toBeInTheDocument();
    });
  });

  it("shows capacity of the selected round: 360 min available, over by 1 h at 420", () => {
    mocks.weekly = [order({ cafeId: "c2", cafeName: "Belleville", status: "approved", items: [item("p2", 7)] })];
    const { container } = render(<StoresReview />);
    expect(screen.getByText(/7 h \/ 6 h/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Dépassement de 1 h");
    expect(container.querySelector('[data-over="true"]')).not.toBeNull();
  });

  it("creates an urgent order for a picked café", () => {
    render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle commande urgente" }));
    const submit = screen.getByRole("button", { name: "Envoyer la demande" });
    fireEvent.click(screen.getAllByLabelText("Augmenter la quantité")[0]);
    fireEvent.change(screen.getByPlaceholderText(/Pourquoi/), { target: { value: "Event" } });
    expect(submit).toBeDisabled(); // no café chosen yet
    fireEvent.change(screen.getByLabelText("Café"), { target: { value: "c2" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(mocks.createUrgent).toHaveBeenCalledWith(
      expect.objectContaining({ cafeId: "c2", reason: "Event", items: [{ productId: "p1", units: 1 }] }),
      expect.anything(),
    );
  });

  const openSent = (over: Partial<KitchenOrder> = {}) => {
    mocks.weekly = [order({ id: "ord1", cafeId: "c2", cafeName: "Belleville", status: "sent", items: [item("p1", 1)], ...over })];
    const r = render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
    return r;
  };

  it("does not approve when a pending adjustment fails", async () => {
    vi.useFakeTimers();
    try {
      mocks.adjust.mockRejectedValue(new Error("x"));
      openSent();
      await act(async () => {});
      fireEvent.click(screen.getAllByLabelText("Augmenter la quantité")[0]);
      fireEvent.click(screen.getByRole("button", { name: "Approuver" }));
      await act(async () => {});
      expect(mocks.adjust).toHaveBeenCalled();
      expect(mocks.approve).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("previews capacity from the opened order's own round", async () => {
    mocks.urgent = [order({ id: "u1", cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "sent", productionDate: "2026-11-06", neededBy: "2026-11-06T08:00:00Z", items: [item("p1", 1)] })];
    mocks.extra = [order({ cafeId: "c2", cafeName: "Belleville", status: "approved", productionDate: "2026-11-06", items: [item("p1", 10)] })];
    render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
    await act(async () => {});
    expect(screen.getAllByText(/13 h 30 \/ 5 h/).length).toBeGreaterThan(0); // Friday capacity, not Tuesday's 6 h
  });

  it("unlocks only after a pending lock resolves", async () => {
    let resolveLock!: () => void;
    mocks.lock.mockReturnValue(new Promise<void>((r) => { resolveLock = r; }));
    const { unmount } = openSent();
    unmount();
    await act(async () => {});
    expect(mocks.unlock).not.toHaveBeenCalled();
    await act(async () => { resolveLock(); });
    expect(mocks.unlock).toHaveBeenCalledWith({ orderId: "ord1" });
  });

  it("disables decline with an empty note", async () => {
    mocks.urgent = [order({ id: "u1", cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "sent", neededBy: "2026-11-03T08:00:00Z", items: [item("p1", 1)] })];
    render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
    expect(screen.getByRole("button", { name: "Confirmer le refus" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motif du refus"), { target: { value: "no" } });
    expect(screen.getByRole("button", { name: "Confirmer le refus" })).not.toBeDisabled();
  });

  it("is read-only with a message when the order is locked", async () => {
    mocks.lock.mockRejectedValue(new Error("order_locked"));
    openSent();
    await act(async () => {});
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    for (const b of screen.getAllByLabelText("Augmenter la quantité")) expect(b).toBeDisabled();
    expect(screen.getByText(/err/)).toBeInTheDocument();
  });

  it("offers the WhatsApp share after approving with changes", async () => {
    mocks.approve.mockImplementation((_v: unknown, o: { onSuccess: (r: unknown) => void }) => o.onSuccess({ changes: [{ product_name: "Pandebono", from: 1, to: 2 }] }));
    openSent();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Approuver" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: /Partager les modifications/ })).toBeInTheDocument();
  });

  it("notifies the café once when an approved order was adjusted, after the flush on close", async () => {
    vi.useFakeTimers();
    try {
      mocks.weekly = [order({ id: "ord1", cafeId: "c2", cafeName: "Belleville", status: "approved", items: [item("p1", 1)] })];
      const { unmount } = render(<StoresReview />);
      fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
      await act(async () => {});
      fireEvent.click(screen.getAllByLabelText("Augmenter la quantité")[0]);
      fireEvent.click(screen.getAllByLabelText("Augmenter la quantité")[0]);
      unmount();
      await act(async () => {});
      expect(mocks.adjust).toHaveBeenCalledWith({ orderId: "ord1", productId: "p1", adjustedUnits: 3 });
      expect(mocks.notify).toHaveBeenCalledTimes(1);
      expect(mocks.notify).toHaveBeenCalledWith("order_approved", "ord1");
    } finally { vi.useRealTimers(); }
  });

  it("does not notify when nothing was adjusted on an approved order", async () => {
    mocks.weekly = [order({ id: "ord1", cafeId: "c2", cafeName: "Belleville", status: "approved", items: [item("p1", 1)] })];
    const { unmount } = render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
    await act(async () => {});
    unmount();
    await act(async () => {});
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
