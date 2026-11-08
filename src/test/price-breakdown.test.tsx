import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { computeOrderBreakdown } from "@/lib/pricing";

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
    expect(screen.getByText("Votre remise −10 %")).toBeInTheDocument();
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
    expect(screen.queryByText(/Votre remise/)).toBeNull();
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
});
