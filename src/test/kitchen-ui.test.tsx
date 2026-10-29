import reviewSheetSource from "@/kitchen/stores/OrderReviewSheet.tsx?raw";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuantityStepper } from "@/components/QuantityStepper";
import CapacityBar from "@/kitchen/stores/CapacityBar";
import { useCuisineTheme } from "@/kitchen/ui/useCuisineTheme";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { contrastRatio } from "@/kitchen/ui/contrast";
import { BrandShape } from "@/kitchen/ui/BrandShape";
import { PILL_COLORS, toneForStatus } from "@/kitchen/ui/StatusPill";

function Probe() {
  useCuisineTheme();
  return null;
}

describe("useCuisineTheme", () => {
  it("adds theme-cuisine to <html> while mounted and removes it after", () => {
    const { unmount } = render(<Probe />);
    expect(document.documentElement).toHaveClass("theme-cuisine");
    unmount();
    expect(document.documentElement).not.toHaveClass("theme-cuisine");
  });

  it("keeps the class until the last user unmounts", () => {
    const a = render(<Probe />);
    const b = render(<Probe />);
    a.unmount();
    expect(document.documentElement).toHaveClass("theme-cuisine");
    b.unmount();
    expect(document.documentElement).not.toHaveClass("theme-cuisine");
  });
});

describe("shared shadcn components under the PLURAL theme", () => {
  it("button gets pill shape app-wide and bigger touch sizes only in Cuisine", () => {
    const cls = buttonVariants({});
    expect(cls).toContain("rounded-full");
    expect(cls).not.toContain("rounded-md");
    expect(cls).not.toContain("plural:");
    expect(cls).toContain("cuisine:h-12");
  });

  it("bottom sheet shows a grabber", () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>T</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(document.querySelector("[data-grabber]")).not.toBeNull();
  });
});

describe("caller classes win over the baked-in look", () => {
  it("outline button keeps a caller's destructive colours", () => {
    const cls = cn(buttonVariants({ variant: "outline" }), "text-destructive border-destructive");
    expect(cls).toContain("text-destructive");
    expect(cls).not.toContain("text-secondary-foreground");
  });
});

describe("brand primitives", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#F0605C")).toBeLessThan(4.5); // why coral carries ink
  });
  it.each(Object.entries(PILL_COLORS))("pill %s reaches 4.5:1", (_tone, { bg, fg }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("muted text on paper reaches 4.5:1", () => {
    expect(contrastRatio("#6B645B", "#FBF8F1")).toBeGreaterThanOrEqual(4.5);
  });
  it("maps order statuses to tones", () => {
    expect(toneForStatus("approved")).toBe("blue");
    expect(toneForStatus("ready")).toBe("green");
    expect(toneForStatus("declined")).toBe("coral");
  });
  it("shapes are hidden from screen readers", () => {
    const { container } = render(<BrandShape kind="triangle" color="coral" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("CapacityBar", () => {
  it("capacity overrun is ink text on a coral pill, not red text", () => {
    render(<CapacityBar neededMinutes={400} availableMinutes={300} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Dépassement de 1 h 40");
    expect(alert.className).not.toMatch(/text-destructive/);
    expect(alert.className).toMatch(/bg-brand-coral-100/);
  });
});

describe("QuantityStepper", () => {
  it("adds cuisine pill classes and keeps the coffee classes", () => {
    render(<QuantityStepper value={1} step={1} onChange={() => {}} />);
    for (const name of ["Diminuer la quantité", "Augmenter la quantité"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).toContain("rounded-full");
      expect(cls).not.toContain("rounded-lg");
      expect(cls).toContain("cuisine:h-10");
    }
  });

  it("keeps both buttons visible against the pill on sticky hover", () => {
    render(<QuantityStepper value={0} step={1} onChange={() => {}} />);
    for (const name of ["Diminuer la quantité", "Augmenter la quantité"]) {
      expect(screen.getByRole("button", { name }).className).toContain("hover:bg-card");
    }
  });
});

describe("OrderReviewSheet add-product list", () => {
  it("renders the hidden suffix in ink, not muted grey (contrast on bg-secondary)", () => {
    const line = reviewSheetSource.split("\n").find((l) => l.includes("{p.name}{!p.isVisible"));
    expect(line).toBeDefined();
    expect(line).toContain("text-brand-ink");
    expect(line).not.toContain("text-muted-foreground");
  });
});
