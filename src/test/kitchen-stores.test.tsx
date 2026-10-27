import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { products, item, order } from "./kitchen-fixtures";
import type { KitchenOrder } from "@/kitchen/types";

// Server-realistic: the current (ordering) week's cutoff is always in the future.
// Default moment: Tue 27 Oct 2026 10:00 Paris → ordering week 2 Nov, production week 26 Oct.
const mocks = vi.hoisted(() => ({
  now: new Date("2026-10-27T09:00:00Z"),
  week: { weekStart: "2026-11-02", cutoffAt: "2026-11-01T19:00:00Z" },
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
  byWeek: {} as Record<string, KitchenOrder[]>,
}));

vi.mock("@/kitchen/api", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });
  return {
    useKitchenProducts: () => ({ data: products }),
    useCurrentWeek: () => ({ data: mocks.week }),
    useKitchenSettings: () => ({ data: { weeklyCapacityMinutes: 600 } }),
    useKitchenCafes: () => ({ data: mocks.cafes }),
    useKitchenOrders: (f: { kind?: string; weekStart?: string }) => ({
      data: f.kind === "urgent" ? mocks.urgent
        : f.kind === "weekly" ? mocks.weekly.filter((o) => !f.weekStart || o.weekStart === f.weekStart)
        : (mocks.byWeek[f.weekStart ?? ""] ?? []),
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
  mocks.now = new Date("2026-10-27T09:00:00Z");
  mocks.week = { weekStart: "2026-11-02", cutoffAt: "2026-11-01T19:00:00Z" };
  mocks.createUrgent.mockReset(); mocks.notify.mockReset();
  mocks.weekly = []; mocks.urgent = [];
  mocks.cafes = [{ id: "c1", name: "Artivistas", isActive: true }, { id: "c2", name: "Belleville", isActive: true }];
  mocks.lock.mockReset().mockResolvedValue(undefined); mocks.unlock.mockClear(); mocks.create.mockClear();
  mocks.adjust.mockReset().mockResolvedValue(undefined); mocks.approve.mockReset(); mocks.decline.mockReset();
  mocks.byWeek = {};
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
    expect(mocks.create).toHaveBeenCalledWith({ cafeId: "c1", weekStart: "2026-11-02" }, expect.anything());
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

  it("flags sent-but-unapproved and unsent cafés after cutoff (Sunday 20:30), and shows urgent counts", () => {
    mocks.now = new Date("2026-11-01T19:30:00Z"); // Sun 20:30 Paris, just after the cutoff
    mocks.week = { weekStart: "2026-11-09", cutoffAt: "2026-11-08T19:00:00Z" };
    mocks.weekly = [order({ cafeId: "c2", cafeName: "Belleville", status: "sent", weekStart: "2026-11-02", items: [item("p1", 1)] })];
    mocks.urgent = [
      order({ cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "approved", weekStart: "2026-10-26", items: [item("p1", 1)] }),
      order({ cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "declined", weekStart: "2026-10-12", items: [item("p1", 1)] }),
    ];
    render(<StoresReview />);
    expect(screen.getByText("Semaine du 02/11")).toBeInTheDocument();
    expect(screen.getByText("Non approuvée, non comptée par la cuisine")).toBeInTheDocument();
    expect(screen.getByText("Non envoyée")).toBeInTheDocument();
    expect(screen.getByText(/: 2$/)).toBeInTheDocument();
  });

  describe("default week", () => {
    it("mid-week (Tue): the ordering week, no after-cutoff flags", () => {
      render(<StoresReview />);
      expect(screen.getByText("Semaine du 02/11")).toBeInTheDocument();
      expect(screen.queryByText("Non envoyée")).toBeNull();
    });
    it("mid-week (Tue): the production week while it still has sent orders", () => {
      mocks.weekly = [order({ cafeId: "c2", cafeName: "Belleville", status: "sent", weekStart: "2026-10-26", items: [item("p1", 1)] })];
      render(<StoresReview />);
      expect(screen.getByText("Semaine du 26/10")).toBeInTheDocument();
      expect(screen.getByText("Non approuvée, non comptée par la cuisine")).toBeInTheDocument();
    });
    it("Sunday 20:30: the week starting tomorrow, even with nothing sent", () => {
      mocks.now = new Date("2026-11-01T19:30:00Z");
      mocks.week = { weekStart: "2026-11-09", cutoffAt: "2026-11-08T19:00:00Z" };
      render(<StoresReview />);
      expect(screen.getByText("Semaine du 02/11")).toBeInTheDocument();
    });
    it("Monday 00:30: the started week while it has sent orders, else the ordering week", () => {
      mocks.now = new Date("2026-11-01T23:30:00Z");
      mocks.week = { weekStart: "2026-11-09", cutoffAt: "2026-11-08T19:00:00Z" };
      mocks.weekly = [order({ cafeId: "c2", cafeName: "Belleville", status: "sent", weekStart: "2026-11-02", items: [item("p1", 1)] })];
      const { unmount } = render(<StoresReview />);
      expect(screen.getByText("Semaine du 02/11")).toBeInTheDocument();
      unmount();
      mocks.weekly = [];
      render(<StoresReview />);
      expect(screen.getByText("Semaine du 09/11")).toBeInTheDocument();
    });
    it("'this week' returns to the default week", () => {
      render(<StoresReview />);
      fireEvent.click(screen.getByRole("button", { name: "Semaine précédente" }));
      expect(screen.getByText("Semaine du 26/10")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Cette semaine" }));
      expect(screen.getByText("Semaine du 02/11")).toBeInTheDocument();
    });
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

  it("previews capacity from the opened order's own week", async () => {
    mocks.urgent = [order({ id: "u1", cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "sent", weekStart: "2026-11-09", neededBy: "2026-11-10T08:00:00Z", items: [item("p1", 1)] })];
    mocks.byWeek["2026-11-09"] = [order({ cafeId: "c2", cafeName: "Belleville", status: "approved", weekStart: "2026-11-09", items: [item("p1", 10)] })];
    render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
    await act(async () => {});
    expect(screen.getAllByText(/13 h 30/).length).toBeGreaterThan(0);
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
