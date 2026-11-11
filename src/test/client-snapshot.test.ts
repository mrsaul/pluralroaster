import { describe, it, expect } from "vitest";
import {
  buildClientSnapshot,
  cartItemsToSnapshotItems,
  diffReceipts,
  parseClientSnapshot,
  rpcTotalsFromBreakdown,
  snapshotLines,
  storedLines,
  type ReceiptStoredItem,
} from "@/lib/clientSnapshot";
import { computeOrderBreakdown, round2, storedOrderBreakdown } from "@/lib/pricing";
import type { CartItem } from "@/lib/store";

type SnapItem = ReturnType<typeof cartItemsToSnapshotItems>[number];

const cauca = (quantity: number, pricePerKg = 26.5): SnapItem => ({
  name: "Cauca", sizeLabel: null, sizeKg: null, quantity, unitPrice: null, pricePerKg, kind: "coffee",
});
const bresilBags = (quantity: number): SnapItem => ({
  name: "Brésil", sizeLabel: "250g", sizeKg: 0.25, quantity, unitPrice: 9.5, pricePerKg: 28, kind: "coffee",
});

const storedCauca = (quantity: number, price = 26.5): ReceiptStoredItem => ({
  kind: "coffee", quantity, price_per_kg: price, product_name: "Cauca", size_label: null, size_kg: null,
});
const storedBresil = (quantity: number, price = 38): ReceiptStoredItem => ({
  kind: "coffee", quantity, price_per_kg: price, product_name: "Brésil", size_label: "250g", size_kg: 0.25,
});
const storedService = (net: number, full = 24, disc = 50): ReceiptStoredItem => ({
  kind: "service", quantity: 1, price_per_kg: net, list_price: full, line_discount_percent: disc,
  product_name: "Livraison", size_label: null, size_kg: null,
});

/** Snapshot of a client order, priced like checkout does. */
function snapshotFor(items: SnapItem[], discountPercent: number) {
  const coffeeLines = items.map((i) => {
    const pricePerKg = i.unitPrice != null && i.sizeKg ? i.unitPrice / i.sizeKg : i.pricePerKg;
    return { pricePerKg, quantityKg: i.sizeKg ? i.sizeKg * i.quantity : i.quantity, vatRate: 5.5 };
  });
  const breakdown = computeOrderBreakdown({ coffeeLines, discountPercent, delivery: { kind: "auto", free: false } });
  return buildClientSnapshot({
    items, breakdown, deliveryDate: "2026-11-20", notes: null, discountPercent, source: "client",
  });
}

describe("client snapshot diff", () => {
  it("identical order is identical", () => {
    const snap = snapshotFor([cauca(20)], 10);
    const rows = [storedCauca(20), storedService(12, 24, 50)];
    const current = storedOrderBreakdown(rows, 10);
    const d = diffReceipts(snap, rows, current);
    expect(d.identical).toBe(true);
    expect(d.htDelta).toBe(0);
    expect(d.deliveryChanged).toBe(false);
  });

  it("bag lines match stored kg rows", () => {
    const snap = snapshotFor([bresilBags(4)], 0);
    const rows = [storedBresil(1, 38), storedService(10, 20, 50)];
    const d = diffReceipts(snap, rows, storedOrderBreakdown(rows, 0));
    expect(d.identical).toBe(true);
    expect(d.lines[0].before?.unit).toBe("bag");
    expect(d.lines[0].before?.quantity).toBe(4);
    expect(d.lines[0].after?.quantity).toBe(4);
  });

  it("quantity change is flagged", () => {
    const snap = snapshotFor([bresilBags(4)], 0);
    const rows = [storedBresil(2.25, 38), storedService(10, 20, 50)];
    const current = storedOrderBreakdown(rows, 0);
    const d = diffReceipts(snap, rows, current);
    expect(d.identical).toBe(false);
    expect(d.lines[0].status).toBe("changed");
    expect(d.lines[0].after?.quantity).toBe(9);
    expect(d.htDelta).toBe(round2(current.totalHT - snap.breakdown.totalHT));
  });

  it("added and removed lines", () => {
    const snap = snapshotFor([cauca(10), bresilBags(4)], 0);
    const rows = [storedCauca(10), storedService(10, 20, 50), { ...storedCauca(5), product_name: "Huila" }];
    const d = diffReceipts(snap, rows, storedOrderBreakdown(rows, 0));
    const byKey = Object.fromEntries(d.lines.map((l) => [l.key, l.status]));
    expect(byKey["Cauca::kg"]).toBe("same");
    expect(byKey["Brésil::0.25"]).toBe("removed");
    expect(byKey["Huila::kg"]).toBe("added");
    expect(d.identical).toBe(false);
  });

  it("same product two sizes stays two lines", () => {
    const snap = snapshotFor([cauca(5), { ...bresilBags(4), name: "Cauca" }], 0);
    const keys = snapshotLines(snap).map((l) => l.key);
    expect(keys).toEqual(["Cauca::kg", "Cauca::0.25"]);
    const stored = storedLines([storedCauca(5), { ...storedBresil(1), product_name: "Cauca" }]);
    expect(stored.map((l) => l.key)).toEqual(keys);
  });

  it("delivery change alone is a difference", () => {
    const snap = snapshotFor([cauca(20)], 0); // 20 kg -> 24 full, 50 % -> 12 net
    expect(snap.breakdown.delivery?.netHT).toBe(12);
    const rows = [storedCauca(20), storedService(15, 30, 50)];
    const d = diffReceipts(snap, rows, storedOrderBreakdown(rows, 0));
    expect(d.lines.every((l) => l.status === "same")).toBe(true);
    expect(d.deliveryChanged).toBe(true);
    expect(d.identical).toBe(false);
  });

  it("cent rounding does not count as change", () => {
    const snap = snapshotFor([bresilBags(1)], 0);
    const rows = [storedBresil(0.25 * 1, 37.999999), storedService(10, 20, 50)];
    const d = diffReceipts(snap, rows, storedOrderBreakdown(rows, 0));
    expect(d.lines[0].status).toBe("same");
  });
});

describe("parseClientSnapshot", () => {
  it("rejects junk", () => {
    expect(parseClientSnapshot(null)).toBeNull();
    expect(parseClientSnapshot({})).toBeNull();
    expect(parseClientSnapshot({ version: 2 })).toBeNull();
    expect(parseClientSnapshot({ version: 1 })).toBeNull();
    expect(parseClientSnapshot("x")).toBeNull();
  });
  it("round-trips a built snapshot", () => {
    const snap = snapshotFor([cauca(10)], 0);
    expect(parseClientSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(snap.version).toBe(1);
    expect(snap.orderId).toBe("");
  });
});

describe("cartItemsToSnapshotItems", () => {
  it("maps like checkout", () => {
    const item = {
      product: { name: "Cauca", pricePerKg: 26.5 }, quantity: 2, sizeLabel: "250g", sizeKg: 0.25, unitPrice: 9.5,
    } as unknown as CartItem;
    expect(cartItemsToSnapshotItems([item])).toEqual([
      { name: "Cauca", sizeLabel: "250g", sizeKg: 0.25, quantity: 2, unitPrice: 9.5, pricePerKg: 26.5, kind: "coffee" },
    ]);
  });
});

describe("rpcTotalsFromBreakdown", () => {
  it("omits p_discount_percent without a tier", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 26.5, quantityKg: 5, vatRate: 5.5 }],
      discountPercent: 0,
      delivery: { kind: "auto", free: false },
    });
    const r = rpcTotalsFromBreakdown(b);
    expect(r).not.toHaveProperty("p_discount_percent");
    expect(r.p_total_price).toBe(b.totalHT);
    expect(r.p_delivery).toEqual({ full_price: 20, discount_percent: 50, net: 10 });
  });
  it("free delivery and tier", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 26.5, quantityKg: 5, vatRate: 5.5 }],
      discountPercent: 10,
      delivery: { kind: "auto", free: true },
    });
    const r = rpcTotalsFromBreakdown(b);
    expect(r.p_delivery?.net).toBe(0);
    expect(r.p_delivery?.discount_percent).toBe(100);
    expect(r.p_discount_percent).toBe(10);
  });
  it("no delivery, no p_delivery", () => {
    const b = storedOrderBreakdown([storedCauca(5)], 0);
    expect(rpcTotalsFromBreakdown(b)).not.toHaveProperty("p_delivery");
  });
});
