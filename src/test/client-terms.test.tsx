import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CheckoutPage from "@/pages/CheckoutPage";
import { CartBar } from "@/components/CartBar";
import type { CartItem, Product } from "@/lib/store";
import type { TierRules } from "@/lib/tierRules";
import { kgByTheKg, clientTermsAndNudge } from "@/lib/pricing";

vi.mock("@/components/DeliveryDatePicker", () => ({
  DeliveryDatePicker: () => <p>date</p>,
}));

const product: Product = {
  id: "p1", name: "Colombia Supremo", origin: "Colombia", sku: "COL-1",
  pricePerKg: 28, roastLevel: "medium", available: true, vatRate: 5.5,
};
const AMULETTE: TierRules = { kg: 5, bag: 5, thresholdKg: 20, kgAbove: 10 };

const bags: CartItem = { product, quantity: 4, sizeLabel: "250 g", sizeKg: 0.25, unitPrice: 7 };

function renderCheckout(kg: number, rules?: TierRules, onConfirm = vi.fn().mockResolvedValue({ orderId: "o1" })) {
  const items: CartItem[] = [{ product, quantity: kg }, bags];
  render(
    <CheckoutPage items={items} totalKg={kg + 1} onBack={() => {}} onConfirm={onConfirm}
      rules={rules} freeDelivery={false} initialDeliveryDate="2026-12-01" />,
  );
  return onConfirm;
}

describe("client terms and nudge at checkout", () => {
  it("shows terms, reached nudge, and per-line rates in the snapshot", async () => {
    const onConfirm = renderCheckout(22, AMULETTE);
    expect(screen.getByText("Vos conditions : café au kg −5 % · dès 20 kg −10 % · sachets −5 %")).toBeInTheDocument();
    expect(screen.getByText("Remise −10 % atteinte")).toBeInTheDocument();
    expect(screen.getByText("Remise café au kg −10 %")).toBeInTheDocument();
    expect(screen.getByText("Remise sachets −5 %")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][2].breakdown.coffee.lineRates).toEqual([10, 5]);
  });

  it("nudges toward the volume step", () => {
    renderCheckout(18.5, AMULETTE);
    expect(screen.getByText("Plus que 1,5 kg pour passer à −10 %")).toBeInTheDocument();
  });

  it("shows neither without a tier", () => {
    renderCheckout(18.5, undefined);
    expect(screen.queryByText(/Vos conditions/)).toBeNull();
    expect(screen.queryByText(/Plus que/)).toBeNull();
  });
});

describe("kgByTheKg / rounding", () => {
  it("rounds so 19.7 + 0.3 reaches the step", () => {
    const lines = [
      { pricePerKg: 28, quantityKg: 19.7, vatRate: 5.5, isBag: false },
      { pricePerKg: 28, quantityKg: 0.3, vatRate: 5.5, isBag: false },
      { pricePerKg: 28, quantityKg: 1, vatRate: 5.5, isBag: true },
    ];
    expect(kgByTheKg(lines)).toBe(20);
    const { nudge } = clientTermsAndNudge(AMULETTE, [
      { product, quantity: 19.7 }, { product, quantity: 0.3 },
    ]);
    expect(nudge).toBe("Remise −10 % atteinte");
  });
  it("is null without a volume step", () => {
    expect(clientTermsAndNudge({ kg: 5, bag: 5, thresholdKg: null, kgAbove: null }, [{ product, quantity: 3 }]).nudge).toBeNull();
  });
});

describe("CartBar terms and nudge", () => {
  it("renders them when given", () => {
    render(<CartBar itemCount={1} totalPrice={10} onCheckout={() => {}} terms="Vos conditions : x" nudge="Plus que 1 kg pour passer à −10 %" />);
    expect(screen.getByText("Vos conditions : x")).toBeInTheDocument();
    expect(screen.getByText("Plus que 1 kg pour passer à −10 %")).toBeInTheDocument();
  });
  it("renders nothing extra otherwise", () => {
    render(<CartBar itemCount={1} totalPrice={10} onCheckout={() => {}} />);
    expect(screen.queryByText(/Vos conditions|Plus que/)).toBeNull();
  });
});
