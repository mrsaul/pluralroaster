import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientReceiptCompare } from "@/components/ClientReceiptCompare";
import { buildClientSnapshot, type ReceiptStoredItem } from "@/lib/clientSnapshot";
import { storedOrderBreakdown } from "@/lib/pricing";

const stored = (quantity: number): ReceiptStoredItem[] => [
  { kind: "coffee", quantity, price_per_kg: 25, product_name: "Cauca", size_label: null, size_kg: null },
];
const snapshotFor = (items: ReceiptStoredItem[], source: "client" | "admin" = "client") => {
  const breakdown = storedOrderBreakdown(items, 0);
  return buildClientSnapshot({
    items: items.map((i) => ({
      name: i.product_name, sizeLabel: null, sizeKg: null, quantity: i.quantity,
      unitPrice: null, pricePerKg: i.price_per_kg, kind: "coffee" as const,
    })),
    breakdown, deliveryDate: "2026-11-20", notes: null, discountPercent: 0, source, orderId: "o1",
  });
};

const renderIt = (snapshotRaw: unknown, items: ReceiptStoredItem[]) =>
  render(
    <ClientReceiptCompare open onOpenChange={() => {}} snapshotRaw={snapshotRaw}
      items={items} discountPercent={0} />,
  );

describe("ClientReceiptCompare", () => {
  it("no snapshot", () => {
    renderIt(null, stored(20));
    expect(screen.getByText("Récapitulatif client non disponible")).toBeInTheDocument();
    expect(screen.getByText("Actuelle (à facturer)")).toBeInTheDocument();
    expect(screen.queryByText("Vu par le client")).toBeNull();
  });
  it("identical", () => {
    renderIt(snapshotFor(stored(20)), stored(20));
    expect(screen.getByText("Vu par le client")).toBeInTheDocument();
    expect(screen.getByText("Identique à la commande")).toBeInTheDocument();
    expect(screen.queryByText("Actuelle (à facturer)")).toBeNull();
  });
  it("edited", () => {
    const { container } = renderIt(snapshotFor(stored(20)), stored(22));
    expect(screen.getByText("Vu par le client")).toBeInTheDocument();
    expect(screen.getByText("Actuelle (à facturer)")).toBeInTheDocument();
    expect(screen.getByText(/Modifiée après validation/).textContent).toMatch(/·\s\+50,00\s€\sHT/);
    expect(container.ownerDocument.querySelector('[data-change="changed"]')).not.toBeNull();
  });
  it("admin source", () => {
    renderIt(snapshotFor(stored(20), "admin"), stored(20));
    expect(screen.getByText("Créée par l'admin")).toBeInTheDocument();
  });
  it("mismatch", () => {
    renderIt({ ...snapshotFor(stored(20)), mismatch: true }, stored(22));
    const alert = screen.getByText("Copie incohérente avec la commande enregistrée");
    expect(alert).toBeInTheDocument();
    expect(alert.className).toMatch(/text-destructive/);
    expect(screen.queryByText(/Modifiée après validation/)).toBeNull();
  });
  it("added and removed lines", () => {
    const snap = snapshotFor(stored(20));
    const current: ReceiptStoredItem[] = [
      { kind: "coffee", quantity: 5, price_per_kg: 30, product_name: "Brésil", size_label: null, size_kg: null },
    ];
    const { baseElement } = renderIt(snap, current);
    expect(baseElement.querySelector('[data-change="removed"]')).not.toBeNull();
    expect(baseElement.querySelector('[data-change="added"]')).not.toBeNull();
    expect(screen.getByText("nouveau")).toBeInTheDocument();
  });
  it("delivery-only change shows Livraison modifiée", () => {
    const withDelivery = (full: number): ReceiptStoredItem[] => [
      ...stored(20),
      { kind: "service", quantity: 1, price_per_kg: full / 2, product_name: "Livraison à vélo Loberz", size_label: null, size_kg: null, list_price: full, line_discount_percent: 50 } as ReceiptStoredItem,
    ];
    renderIt(snapshotFor(withDelivery(24)), withDelivery(30));
    expect(screen.getByText("Livraison modifiée")).toBeInTheDocument();
  });
  it("no delivery badge when delivery unchanged", () => {
    renderIt(snapshotFor(stored(20)), stored(22));
    expect(screen.queryByText("Livraison modifiée")).toBeNull();
  });
  it("unreadable snapshot with mismatch still warns", () => {
    renderIt({ raw: "oops", orderId: "o1", mismatch: true }, stored(20));
    expect(screen.getByText("Copie incohérente avec la commande enregistrée")).toBeInTheDocument();
    expect(screen.getByText("Actuelle (à facturer)")).toBeInTheDocument();
    expect(screen.queryByText("Vu par le client")).toBeNull();
  });
});
