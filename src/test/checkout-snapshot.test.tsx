import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CheckoutPage from "@/pages/CheckoutPage";
import { computeOrderBreakdown, cartToCoffeeLines } from "@/lib/pricing";
import type { CartItem, Product } from "@/lib/store";

vi.mock("@/components/DeliveryDatePicker", () => ({
  DeliveryDatePicker: ({ selected }: { selected: string | null }) => (
    <p data-testid="picked-date">{selected ?? "none"}</p>
  ),
}));

const product: Product = {
  id: "p1",
  name: "Colombia Supremo",
  origin: "Colombia",
  sku: "COL-1",
  pricePerKg: 28,
  roastLevel: "medium",
  available: true,
  vatRate: 5.5,
};

describe("CheckoutPage snapshot", () => {
  it("checkout passes the shown breakdown as snapshot", async () => {
    const items: CartItem[] = [{ product, quantity: 20 }];
    const onConfirm = vi.fn().mockResolvedValue({ orderId: "ord-1" });

    render(
      <CheckoutPage
        items={items}
        totalKg={20}
        onBack={() => {}}
        onConfirm={onConfirm}
        discountPercent={10}
        freeDelivery={false}
        initialDeliveryDate="2026-12-01"
      />,
    );

    expect(screen.getByTestId("picked-date").textContent).toBe("2026-12-01");
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const expected = computeOrderBreakdown({
      coffeeLines: cartToCoffeeLines(items),
      discountPercent: 10,
      delivery: { kind: "auto", free: false },
    });
    const [date, notes, snapshot] = onConfirm.mock.calls[0];
    expect(date).toBe("2026-12-01");
    expect(notes).toBeUndefined();
    expect(snapshot.source).toBe("client");
    expect(snapshot.deliveryDate).toBe("2026-12-01");
    expect(snapshot.breakdown.totalHT).toBe(expected.totalHT);
    expect(screen.getAllByText(`€${snapshot.breakdown.totalHT.toFixed(2)}`).length).toBeGreaterThan(0);
    expect(snapshot.discountPercent).toBe(10);
    await waitFor(() => expect(localStorage.getItem("plural_order_receipt")).toContain("ord-1"));
  });

  it("ignores a past initial delivery date", () => {
    render(
      <CheckoutPage
        items={[{ product, quantity: 20 }]}
        totalKg={20}
        onBack={() => {}}
        onConfirm={vi.fn()}
        freeDelivery={false}
        initialDeliveryDate="2020-01-01"
      />,
    );
    expect(screen.getByTestId("picked-date").textContent).toBe("none");
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });
});
