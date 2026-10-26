import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
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
}));

vi.mock("@/kitchen/api", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });
  return {
    useKitchenProducts: () => ({ data: products }),
    useCurrentWeek: () => ({ data: mocks.week }),
    useKitchenSettings: () => ({ data: { weeklyCapacityMinutes: 600 } }),
    useKitchenCafes: () => ({ data: mocks.cafes }),
    useKitchenOrders: (f: { kind?: string }) => ({ data: f.kind === "urgent" ? mocks.urgent : mocks.weekly }),
    useLockOrder: () => ({ mutate: mocks.lock }),
    useUnlockOrder: () => ({ mutate: mocks.unlock }),
    useCreateOrderForCafe: () => ({ mutate: mocks.create, isPending: false }),
    useAdjustItem: mut, useSetItem: mut, useApproveOrder: mut, useDeclineOrder: mut, useSendOrder: mut,
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
  mocks.lock.mockClear(); mocks.unlock.mockClear(); mocks.create.mockClear();
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

  it("locks on open and unlocks on unmount", () => {
    mocks.weekly = [order({ id: "ord1", cafeId: "c2", cafeName: "Belleville", status: "sent", items: [item("p1", 1)] })];
    const { unmount } = render(<StoresReview />);
    fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
    expect(mocks.lock).toHaveBeenCalledWith({ orderId: "ord1" }, expect.anything());
    unmount();
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
});
