import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CapacityBar from "@/kitchen/stores/CapacityBar";
import { useCuisineTheme } from "@/kitchen/ui/useCuisineTheme";
import { buttonVariants } from "@/components/ui/button";
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

describe("shared shadcn components under cuisine:", () => {
  it("button gets pill classes only under the cuisine variant", () => {
    const cls = buttonVariants({});
    expect(cls).toContain("cuisine:rounded-full");
    expect(cls).toContain("rounded-md"); // coffee/admin unchanged
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
