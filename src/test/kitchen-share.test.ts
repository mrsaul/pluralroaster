import { describe, expect, it } from "vitest";
import { buildChangesShareText, buildOrderShareText, buildPackingListText, buildProductionShareText } from "@/kitchen/lib/share";
import { computeProduction } from "@/kitchen/lib/production";
import { item, order, products } from "./kitchen-fixtures";

describe("share texts", () => {
  it("changes text", () => {
    const t = buildChangesShareText("Artivistas", [{ productName: "Cookies", from: 1, to: 0 }], "fr");
    expect(t).toContain("Cookies : 1 → 0");
    expect(t).toContain("Artivistas");
    expect(t).not.toContain("*");
    expect(buildChangesShareText("Artivistas", [{ productName: "Cookies", from: 1, to: 0 }], "en")).toContain("Cookies: 1 → 0");
  });

  it("order text lists lines and adjustments", () => {
    const o = order({ cafeName: "Artivistas", items: [item("p1", 2), item("p2", 1, 2)] });
    const fr = buildOrderShareText(o, "fr");
    expect(fr).toContain("Artivistas");
    expect(fr).toContain("Commande pour la production du mardi 3 nov.");
    expect(fr).toContain("Pandebono — 2 × Batch (100 pcs)");
    expect(fr).toContain("Cookies — 1 → 2 × Batch (48 pcs)");
    expect(buildOrderShareText(o, "en")).toContain("Order for production on Tuesday 3 Nov");
    expect(buildOrderShareText({ ...o, kind: "urgent" }, "fr")).toContain("Commande urgente");
    expect(buildOrderShareText({ ...o, kind: "urgent" }, "en")).toContain("Urgent order");
  });

  it("production text", () => {
    const rows = computeProduction([order({ items: [item("p1", 3)] })], products);
    const t = buildProductionShareText("2026-11-03", rows, "fr");
    expect(t).toContain("Production du mardi 3 nov.");
    expect(buildProductionShareText("2026-11-03", rows, "en")).toContain("Production for Tuesday 3 Nov");
    expect(t).toContain("Pandebono — à produire : 2 × Batch (commandé 3, stock 1)");
  });

  it("packing list uses effective units", () => {
    const o = order({ cafeName: "Artivistas", items: [item("p1", 1, 2)] });
    const t = buildPackingListText(o, "en");
    expect(t).toContain("Pandebono — 2 × Batch (100 pcs)");
    expect(t).not.toContain("→");
    expect(t).toContain("Production on Tuesday 3 Nov");
    expect(buildPackingListText(o, "fr")).toContain("Production du mardi 3 nov.");
  });
});
