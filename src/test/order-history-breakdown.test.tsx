import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrderCard } from "@/components/OrderCard";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { computeOrderBreakdown, orderToBreakdown } from "@/lib/pricing";
import { mapPersistedOrder, type PersistedOrderRow } from "@/lib/persistedOrder";
import type { Order, Product } from "@/lib/store";

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

const baseOrder: Order = {
  id: "o1",
  items: [{ product, quantity: 30 }],
  totalKg: 30,
  totalPrice: 811.98,
  deliveryDate: "2026-03-20",
  status: "delivered",
  createdAt: "2026-03-14",
  discountPercent: 10,
  coffeeLines: [{ pricePerKg: 28, quantityKg: 30, vatRate: 5.5 }],
  delivery: null,
};

const coffeeRow = {
  kind: "product",
  quantity: 30,
  price_per_kg: 25.2,
  product_name: "Colombia Supremo",
  product_sku: "COL-1",
  product_id: "p1",
  products: null,
};

const row = (order_items: PersistedOrderRow["order_items"]): PersistedOrderRow => ({
  id: "o1",
  delivery_date: "2026-03-20",
  total_kg: 30,
  total_price: 800,
  status: "delivered",
  sellsy_id: null,
  created_at: "2026-03-14",
  notes: null,
  reordered_from: null,
  delivery_address_id: null,
  discount_percent: 10,
  order_items,
});

describe("orderToBreakdown", () => {
  it("uses the stored delivery row", () => {
    const b = orderToBreakdown({ ...baseOrder, delivery: { fullPriceHT: 25, discountPercent: 50 } });
    expect(b.delivery?.netHT).toBe(12.5);
    expect(b.coffee.discountPercent).toBe(10);
  });

  it("has no delivery for a legacy order", () => {
    expect(orderToBreakdown(baseOrder).delivery).toBeNull();
  });
});

describe("mapPersistedOrder", () => {
  it("keeps the service row out of items and fills delivery", () => {
    const o = mapPersistedOrder(
      row([
        coffeeRow,
        { ...coffeeRow, kind: "service", product_sku: "0001", product_name: "Livraison", product_id: "svc", quantity: 1, price_per_kg: 12.5, list_price: 25, line_discount_percent: 50 },
      ]),
    );
    expect(o.items).toHaveLength(1);
    expect(o.items[0].product.name).toBe("Colombia Supremo");
    expect(o.delivery).toEqual({ fullPriceHT: 25, discountPercent: 50 });
    expect(o.discountPercent).toBe(10);
  });

  it("maps a legacy service row (no list_price) to a plain charge", () => {
    const o = mapPersistedOrder(
      row([coffeeRow, { ...coffeeRow, kind: "service", product_id: "svc", quantity: 1, price_per_kg: 25 }]),
    );
    expect(o.delivery).toEqual({ fullPriceHT: 25, discountPercent: 0 });
    expect(o.items).toHaveLength(1);
  });

  it("treats an explicit null list_price like a legacy row", () => {
    const o = mapPersistedOrder(
      row([coffeeRow, { ...coffeeRow, kind: "service", product_id: "svc", quantity: 1, price_per_kg: 25, list_price: null, line_discount_percent: null }]),
    );
    expect(o.delivery).toEqual({ fullPriceHT: 25, discountPercent: 0 });
  });

  it("prices the breakdown from stored lines, not the live catalog", () => {
    const cat = { id: "p1", name: "X", origin: null, sku: "X", price_per_kg: 30, roast_level: null, is_active: true, sellsy_tax_rate: 5.5 };
    const o = mapPersistedOrder(row([{ ...coffeeRow, price_per_kg: 28, quantity: 10, products: cat }]));
    expect(o.items[0].product.pricePerKg).toBe(30);
    expect(orderToBreakdown(o).coffee.regularHT).toBe(280);
  });

  it("has delivery null when there is no service row", () => {
    const o = mapPersistedOrder({ ...row([coffeeRow]), discount_percent: null });
    expect(o.delivery).toBeNull();
    expect(o.discountPercent).toBe(0);
  });
});

describe("OrderCard breakdown", () => {
  const open = (order: Order) => {
    render(<OrderCard order={order} />);
    fireEvent.click(screen.getByRole("button"));
  };

  it("renders the breakdown with delivery for a new order", () => {
    open({ ...baseOrder, delivery: { fullPriceHT: 25, discountPercent: 50 } });
    expect(screen.getByText("Livraison à vélo")).toBeInTheDocument();
    expect(screen.getByText("Plural paie 50 %")).toBeInTheDocument();
    expect(screen.getByText("Total TTC")).toBeInTheDocument();
  });

  it("renders a legacy order without a delivery block", () => {
    open(baseOrder);
    expect(screen.queryByText("Livraison à vélo")).not.toBeInTheDocument();
    expect(screen.getByText("Total HT")).toBeInTheDocument();
  });
});

describe("PriceBreakdown with zero delivery contribution", () => {
  it("hides the contribution row and shows delivery as a plain charge", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 28, quantityKg: 30, vatRate: 5.5 }],
      discountPercent: 0,
      delivery: { kind: "stored", fullPriceHT: 25, discountPercent: 0 },
    });
    render(<PriceBreakdown breakdown={b} />);
    expect(screen.getByText("Livraison à vélo")).toBeInTheDocument();
    expect(screen.queryByText(/Plural paie/)).not.toBeInTheDocument();
    expect(screen.queryByText("Livraison offerte")).not.toBeInTheDocument();
    expect(screen.getByText("Votre livraison")).toBeInTheDocument();
  });
});
