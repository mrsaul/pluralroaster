import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderSpaceSwitchIfAllowed } from "@/components/SpaceSwitch";
import type { KitchenAccess } from "@/lib/landing";

const noop = () => {};
const storesMgr: KitchenAccess = { role: "stores_manager", cafeId: null, cafeName: null };

describe("renderSpaceSwitchIfAllowed", () => {
  it("renders nothing for a coffee-only user", () => {
    const el = renderSpaceSwitchIfAllowed("user", null, "coffee", noop);
    expect(el).toBeNull();
    const { container } = render(<>{el}</>);
    expect(screen.queryByText(/cuisine|kitchen/i)).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for roaster even with kitchen access", () => {
    expect(renderSpaceSwitchIfAllowed("roaster", storesMgr, "coffee", noop)).toBeNull();
  });

  it("renders both labels for a coffee user who is a stores manager", () => {
    render(<>{renderSpaceSwitchIfAllowed("user", storesMgr, "coffee", noop)}</>);
    expect(screen.getByText("Café")).toBeInTheDocument();
    expect(screen.getByText("Cuisine")).toBeInTheDocument();
  });

  it("calls onChange with the other space", () => {
    const onChange = vi.fn();
    render(<>{renderSpaceSwitchIfAllowed("user", storesMgr, "coffee", onChange)}</>);
    fireEvent.click(screen.getByText("Cuisine"));
    expect(onChange).toHaveBeenCalledWith("kitchen");
  });
});
