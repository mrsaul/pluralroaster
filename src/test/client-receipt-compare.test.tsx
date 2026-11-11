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
      items={items} discountPercent={0} createdAt="2026-11-11T10:00:00Z" />,
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
    expect(screen.getByText(/Modifiée après validation/).textContent).toMatch(/\+50,00\s€/);
    expect(container.ownerDocument.querySelector('[data-change="changed"]')).not.toBeNull();
  });
  it("admin source", () => {
    renderIt(snapshotFor(stored(20), "admin"), stored(20));
    expect(screen.getByText("Créée par l'admin")).toBeInTheDocument();
  });
  it("mismatch", () => {
    renderIt({ ...snapshotFor(stored(20)), mismatch: true }, stored(22));
    expect(screen.getByText("Copie incohérente avec la commande enregistrée")).toBeInTheDocument();
    expect(screen.queryByText(/Modifiée après validation/)).toBeNull();
  });
});
