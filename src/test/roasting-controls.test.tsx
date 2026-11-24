import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoastingNeed } from "@/lib/roasting";
import { formatPercent } from "@/lib/roasting";

const click = (el: HTMLElement) => fireEvent.click(el);
const typeInto = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

const addMutate = vi.fn().mockResolvedValue(undefined);
const setMutate = vi.fn().mockResolvedValue(undefined);
const defMutate = vi.fn().mockResolvedValue(undefined);
let addPending = false;

vi.mock("@/hooks/useRoasting", () => ({
  useAddRoastedStock: () => ({ mutate: addMutate, mutateAsync: addMutate, isPending: addPending }),
  useSetGreenPercent: () => ({ mutate: setMutate, mutateAsync: setMutate, isPending: false }),
  useSetDefaultGreenPercent: () => ({ mutate: defMutate, mutateAsync: defMutate, isPending: false }),
}));

import { PercentChip } from "@/components/stock/PercentChip";
import { RoastedSheet } from "@/components/stock/RoastedSheet";

const need: RoastingNeed = {
  productId: "p1",
  productName: "Colombia",
  neededKg: 30,
  stockKg: 0,
  toRoastKg: 30,
  percent: 15,
  percentIsCustom: false,
  greenKg: 34.5,
  earliestDelivery: "2026-12-01",
  orderIds: ["o1"],
};

beforeEach(() => {
  vi.clearAllMocks();
  addPending = false;
});

describe("formatPercent", () => {
  it("formats integers and decimals", () => {
    expect(formatPercent(17)).toBe("17");
    expect(formatPercent(17.5)).toBe("17,5");
    expect(formatPercent(17.256)).toBe("17,26");
  });
});

describe("RoastedSheet", () => {
  it("prefills, previews stock and submits", async () => {
    const onClose = vi.fn();
    render(<RoastedSheet need={need} onClose={onClose} />);
    expect(screen.getByText("Torréfié · Colombia")).toBeInTheDocument();
    const input = screen.getByLabelText("Kilos sortis du torréfacteur");
    expect(input).toHaveValue("30.00");
    expect(screen.getByText("0.00 → 30.00 kg")).toBeInTheDocument();
    typeInto(input, "28,5");
    expect(screen.getByText("0.00 → 28.50 kg")).toBeInTheDocument();
    click(screen.getByRole("button", { name: "Ajouter au stock" }));
    expect(addMutate).toHaveBeenCalledTimes(1);
    expect(addMutate).toHaveBeenCalledWith({ productId: "p1", productName: "Colombia", kg: 28.5 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("disables the button while pending", () => {
    addPending = true;
    render(<RoastedSheet need={need} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Ajouter au stock" })).toBeDisabled();
  });

  it.each(["0", ""])("rejects invalid input %j", async (v) => {
    render(<RoastedSheet need={need} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Kilos sortis du torréfacteur");
    typeInto(input, v);
    expect(screen.getByText("Entrez un poids supérieur à 0")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Ajouter au stock" });
    expect(btn).toBeDisabled();
    click(btn);
    expect(addMutate).not.toHaveBeenCalled();
  });

  it("renders nothing when need is null", () => {
    render(<RoastedSheet need={null} onClose={vi.fn()} />);
    expect(screen.queryByText(/Torréfié/)).not.toBeInTheDocument();
  });
});

describe("PercentChip", () => {
  it("default scope saves a valid percent", async () => {
    render(<PercentChip scope="default" percent={15} />);
    const chip = screen.getByRole("button", { name: "Modifier le pourcentage par défaut" });
    expect(chip).toHaveTextContent("Par défaut 15 % ✎");
    click(chip);
    const input = screen.getByRole("textbox");
    typeInto(input, "12");
    click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(defMutate).toHaveBeenCalledWith({ percent: 12 });
  });

  it("rejects 51", async () => {
    render(<PercentChip scope="default" percent={15} />);
    click(screen.getByRole("button", { name: "Modifier le pourcentage par défaut" }));
    const input = screen.getByRole("textbox");
    typeInto(input, "51");
    expect(screen.getByText("Entre 0 et 50 %")).toBeInTheDocument();
    click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(defMutate).not.toHaveBeenCalled();
  });

  it("custom product chip is copper and can reset", async () => {
    render(<PercentChip scope="product" productId="p1" productName="Colombia" percent={17} isCustom />);
    const chip = screen.getByRole("button", { name: "Modifier le pourcentage de Colombia" });
    expect(chip).toHaveTextContent("17 %");
    expect(chip.className).toContain("border-brand-orange-700");
    expect(chip.className).toContain("text-brand-orange-700");
    click(chip);
    click(screen.getByRole("button", { name: "Revenir au défaut" }));
    expect(setMutate).toHaveBeenCalledWith({ productId: "p1", percent: null });
  });

  it("non-custom product chip has no reset and saves a value", async () => {
    render(<PercentChip scope="product" productId="p1" productName="Colombia" percent={15} isCustom={false} />);
    const chip = screen.getByRole("button", { name: "Modifier le pourcentage de Colombia" });
    expect(chip.className).not.toContain("border-brand-orange-700");
    click(chip);
    expect(screen.queryByRole("button", { name: "Revenir au défaut" })).not.toBeInTheDocument();
    const input = screen.getByRole("textbox");
    typeInto(input, "17,5");
    click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(setMutate).toHaveBeenCalledWith({ productId: "p1", percent: 17.5 });
  });
});
