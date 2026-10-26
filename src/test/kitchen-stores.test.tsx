import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { products, item, order } from "./kitchen-fixtures";

const mocks = vi.hoisted(() => ({
  week: { weekStart: "2026-11-02", cutoffAt: "2099-01-01T20:00:00Z" },
  weekly: [] as any[],
  urgent: [] as any[],
  cafes: [] as any[],
  lock: vi.fn(),
  unlock: vi.fn(),
  create: vi.fn(),
  adjust: vi.fn(),
  approve: vi.fn(),
  decline: vi.fn(),
  byWeek: {} as Record<string, any[]>,
}));

vi.mock("@/kitchen/api", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });
  return {
    useKitchenProducts: () => ({ data: products }),
    useCurrentWeek: () => ({ data: mocks.week }),
    useKitchenSettings: () => ({ data: { weeklyCapacityMinutes: 600 } }),
    useKitchenCafes: () => ({ data: mocks.cafes }),
    useKitchenOrders: (f: { kind?: string; weekStart?: string }) => ({
      data: f.kind === "urgent" ? mocks.urgent : f.kind === "weekly" ? mocks.weekly : (mocks.byWeek[f.weekStart ?? ""] ?? []),
    }),
    useLockOrder: () => ({ mutate: mocks.lock, mutateAsync: mocks.lock }),
    useUnlockOrder: () => ({ mutate: mocks.unlock }),
    useCreateOrderForCafe: () => ({ mutate: mocks.create, isPending: false }),
    useAdjustItem: () => ({ mutate: vi.fn(), mutateAsync: mocks.adjust }),
    useApproveOrder: () => ({ mutate: mocks.approve, isPending: false }),
    useDeclineOrder: () => ({ mutate: mocks.decline, isPending: false }),
    useSetItem: mut, useSendOrder: mut,
    kitchenErrorMessage: () => "err",
  };
});

import CapacityBar from "@/kitchen/stores/CapacityBar";
import StoresReview from "@/kitchen/stores/StoresReview";

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  mocks.week = { weekStart: "2026-11-02", cutoffAt: "2099-01-01T20:00:00Z" };
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

  it("flags sent-but-unapproved and unsent cafés after cutoff, and shows urgent counts", () => {
    mocks.week = { weekStart: "2026-11-02", cutoffAt: "2020-01-01T20:00:00Z" };
    mocks.weekly = [order({ cafeId: "c2", cafeName: "Belleville", status: "sent", items: [item("p1", 1)] })];
    mocks.urgent = [
      order({ cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "approved", weekStart: "2026-10-26", items: [item("p1", 1)] }),
      order({ cafeId: "c1", cafeName: "Artivistas", kind: "urgent", status: "declined", weekStart: "2026-10-12", items: [item("p1", 1)] }),
    ];
    render(<StoresReview />);
    expect(screen.getByText("Non approuvée, non comptée par la cuisine")).toBeInTheDocument();
    expect(screen.getByText("Non envoyée")).toBeInTheDocument();
    expect(screen.getByText(/: 2$/)).toBeInTheDocument();
  });

  const openSent = (over: any = {}) => {
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
      fireEvent.click(screen.getAllByLabelText("Increase quantity")[0]);
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
    for (const b of screen.getAllByLabelText("Increase quantity")) expect(b).toBeDisabled();
    expect(screen.getByText(/err/)).toBeInTheDocument();
  });

  it("offers the WhatsApp share after approving with changes", async () => {
    mocks.approve.mockImplementation((_v: any, o: any) => o.onSuccess({ changes: [{ product_name: "Pandebono", from: 1, to: 2 }] }));
    openSent();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Approuver" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: /Partager les modifications/ })).toBeInTheDocument();
  });
});
