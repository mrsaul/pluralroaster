import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { computeOrderBreakdown, type OrderBreakdown } from "@/lib/pricing";
import { buildPlainTextSummary, type OrderReceiptData } from "@/lib/orderUtils";

const line = { pricePerKg: 28, quantityKg: 30, vatRate: 5.5 };

describe("PriceBreakdown", () => {
  it("renders the ZAÏA breakdown in three blocks", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [line],
      discountPercent: 10,
      delivery: { kind: "auto", free: false },
    });
    render(<PriceBreakdown breakdown={b} />);
    expect(screen.getByText("Café")).toBeInTheDocument();
    expect(screen.getByText("30 kg · prix public")).toBeInTheDocument();
    expect(screen.getByText("Remise café au kg −10 %")).toBeInTheDocument();
    expect(screen.getByText("Votre prix café")).toBeInTheDocument();
    expect(screen.getByText("Livraison à vélo")).toBeInTheDocument();
    expect(screen.getByText("Loberz · 11–30 kg")).toBeInTheDocument();
    expect(screen.getByText("Plural paie 50 %")).toBeInTheDocument();
    expect(screen.getByText("Votre livraison")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Total HT")).toBeInTheDocument();
    expect(screen.getByText("TVA 5,5 %")).toBeInTheDocument();
    expect(screen.getByText("TVA 20 %")).toBeInTheDocument();
    expect(screen.getByText("Total TTC")).toBeInTheDocument();
    expect(screen.getByText("€811.98")).toBeInTheDocument();
    expect(screen.getByText("€840.00")).toBeInTheDocument();
    expect(screen.getByText("−€84.00")).toBeInTheDocument();
  });

  it("omits the discount row when there is no tier", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [line],
      discountPercent: 0,
      delivery: { kind: "auto", free: false },
    });
    render(<PriceBreakdown breakdown={b} />);
    expect(screen.queryByText(/Remise/)).toBeNull();
  });

  it("shows 'Livraison offerte' instead of 'Plural paie 50 %' for free delivery", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [line],
      discountPercent: 10,
      delivery: { kind: "auto", free: true },
    });
    render(<PriceBreakdown breakdown={b} />);
    expect(screen.getByText("Livraison offerte")).toBeInTheDocument();
    expect(screen.queryByText("Plural paie 50 %")).toBeNull();
  });

  it("hides the delivery block when there is no delivery", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [line],
      discountPercent: 10,
      delivery: { kind: "none" },
    });
    render(<PriceBreakdown breakdown={b} />);
    expect(screen.queryByText("Livraison à vélo")).toBeNull();
    expect(screen.queryByText("Votre livraison")).toBeNull();
  });

  it("shows the stored delivery contribution percent", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [line],
      discountPercent: 10,
      delivery: { kind: "stored", fullPriceHT: 24, discountPercent: 30 },
    });
    render(<PriceBreakdown breakdown={b} />);
    expect(screen.getByText("Plural paie 30 %")).toBeInTheDocument();
  });

  it("formats kg and percents French-style", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [{ pricePerKg: 27.07, quantityKg: 2.25, vatRate: 5.5 }],
      discountPercent: 12.5,
      delivery: { kind: "stored", fullPriceHT: 20, discountPercent: 37.5 },
    });
    render(<PriceBreakdown breakdown={b} />);
    expect(screen.getByText("2,25 kg · prix public")).toBeInTheDocument();
    expect(screen.getByText("Remise café au kg −12,5 %")).toBeInTheDocument();
    expect(screen.getByText("Plural paie 37,5 %")).toBeInTheDocument();
  });
});

describe("several discount lines", () => {
  const rules = { kg: 10, bag: 5, thresholdKg: null, kgAbove: null };
  const mixed = () =>
    computeOrderBreakdown({
      coffeeLines: [
        { pricePerKg: 28, quantityKg: 10, vatRate: 5.5 },
        { pricePerKg: 30, quantityKg: 2, vatRate: 5.5, isBag: true },
      ],
      rules,
      delivery: { kind: "none" },
    });

  it("shows one row per rate with its amount", () => {
    const b = mixed();
    render(<PriceBreakdown breakdown={b} />);
    expect(screen.getByText("Remise café au kg −10 %")).toBeInTheDocument();
    expect(screen.getByText("Remise sachets −5 %")).toBeInTheDocument();
    expect(screen.getByText("−€28.00")).toBeInTheDocument();
    expect(screen.getByText("−€3.00")).toBeInTheDocument();
  });

  it("legacy breakdown without discounts shows one kg line", () => {
    const b = computeOrderBreakdown({
      coffeeLines: [line],
      discountPercent: 10,
      delivery: { kind: "none" },
    });
    const legacy = JSON.parse(JSON.stringify(b)) as OrderBreakdown;
    delete (legacy.coffee as Partial<OrderBreakdown["coffee"]>).discounts;
    render(<PriceBreakdown breakdown={legacy} />);
    expect(screen.getAllByText(/^Remise/)).toHaveLength(1);
    expect(screen.getByText("Remise café au kg −10 %")).toBeInTheDocument();
    expect(screen.getByText("−€84.00")).toBeInTheDocument();
  });

  it("plain-text summary lists both lines", () => {
    const b = mixed();
    const data: OrderReceiptData = {
      orderId: "a1b2c3d4-0000", placedAt: "2026-11-08T10:00:00Z", deliveryDate: "2026-11-12", notes: null,
      items: [], totalHT: b.totalHT, vatLines: b.vatLines, totalTTC: b.totalTTC, breakdown: b,
    };
    const text = buildPlainTextSummary(data).replace(/[\u00a0\u202f]/g, " ");
    expect(text).toContain("Remise café au kg −10 % : −28,00 €");
    expect(text).toContain("Remise sachets −5 % : −3,00 €");
  });
});
