import { describe, it, expect } from "vitest";
import { validateKitchenAccess } from "@/components/kitchenAccessForm";

describe("validateKitchenAccess", () => {
  it("rejects no coffee access and no kitchen access", () => {
    expect(validateKitchenAccess({ coffeeRole: "none", kitchenRole: null, cafeId: null })).toEqual({
      ok: false,
      error: "needs_some_access",
    });
  });
  it("requires a cafe for coffee_manager", () => {
    expect(validateKitchenAccess({ coffeeRole: "user", kitchenRole: "coffee_manager", cafeId: null })).toEqual({
      ok: false,
      error: "coffee_manager_needs_cafe",
    });
  });
  it("accepts kitchen-only kitchen_manager", () => {
    expect(validateKitchenAccess({ coffeeRole: "none", kitchenRole: "kitchen_manager", cafeId: null })).toEqual({ ok: true });
  });
  it("accepts coffee user plus stores_manager", () => {
    expect(validateKitchenAccess({ coffeeRole: "user", kitchenRole: "stores_manager", cafeId: null })).toEqual({ ok: true });
  });
});
