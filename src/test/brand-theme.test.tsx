import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { contrastRatio } from "@/kitchen/ui/contrast";
import { StatusBadge, STATUS_STYLES } from "@/components/StatusBadge";

const PAPER = "#FBF8F1";
const WHITE = "#FFFFFF";
const HEX: Record<string, string> = {
  "brand-green-600": "#3D7330",
  "brand-blue": "#7E9CD0",
  "brand-orange": "#F0951F",
  "brand-salmon": "#EFA89E",
  "brand-sand": "#F1DDA9",
  "brand-line": "#E7E1D5",
  "brand-ink": "#1C1A17",
  "brand-paper": PAPER,
};

describe("semantic text colours", () => {
  const texts: Array<[string, string, string[]]> = [
    ["destructive", "#B8322E", ["#FDE4E3"]],
    ["success", "#3D7330", ["#DDEAD7"]],
    ["warning", "#A35A00", ["#FCF6E7"]],
    ["info", "#3F5F9A", ["#E8EEF8"]],
  ];
  it.each(texts)("%s reads on paper, white, as a fill and on its tints", (_n, hex, tints) => {
    expect(contrastRatio(hex, PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hex, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PAPER, hex)).toBeGreaterThanOrEqual(4.5);
    for (const t of tints) expect(contrastRatio(hex, t)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("StatusBadge", () => {
  const expected: Record<string, [string, string]> = {
    pending: ["brand-sand", "brand-ink"],
    confirmed: ["brand-blue", "brand-ink"],
    fulfilled: ["brand-line", "brand-ink"],
    synced: ["brand-green-600", "brand-paper"],
    received: ["brand-green-600", "brand-paper"],
    approved: ["brand-blue", "brand-ink"],
    packaging: ["brand-orange", "brand-ink"],
    ready_for_delivery: ["brand-salmon", "brand-ink"],
    delivered: ["brand-line", "brand-ink"],
  };

  it.each(Object.entries(expected))("%s renders as a solid pill with the right colours", (status, [bg, fg]) => {
    const { container } = render(<StatusBadge status={status} />);
    const classes = (container.firstElementChild as HTMLElement).className.split(/\s+/);
    expect(classes).toContain(`bg-${bg}`);
    expect(classes).toContain(`text-${fg}`);
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("font-bold");
    expect(container.textContent).toBe(status);
  });

  it("falls back to grey and shows the Sellsy id when synced", () => {
    const { container } = render(<StatusBadge status="mystery" />);
    expect((container.firstElementChild as HTMLElement).className).toContain("bg-brand-line");
    const synced = render(<StatusBadge status="synced" sellsyId="S-42" />);
    expect(synced.container.textContent).toBe("S-42");
  });

  it.each(Object.entries(STATUS_STYLES))("%s pair reaches 4.5:1", (_s, cls) => {
    const [bg, fg] = cls.split(" ").map((c) => HEX[c.replace(/^(bg|text)-/, "")]);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
