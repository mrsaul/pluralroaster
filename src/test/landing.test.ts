import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveLanding,
  canSwitchSpaces,
  loadLastSpace,
  saveLastSpace,
  showsSpaceSwitch,
  type KitchenAccess,
} from "@/lib/landing";

const kitchenMgr: KitchenAccess = { role: "kitchen_manager", cafeId: null, cafeName: null };
const storesMgr: KitchenAccess = { role: "stores_manager", cafeId: null, cafeName: null };
const coffeeMgr: KitchenAccess = { role: "coffee_manager", cafeId: "c1", cafeName: "Plural Oberkampf" };

describe("resolveLanding", () => {
  it("sends users with no access to login", () => {
    expect(resolveLanding(null, null, null)).toBe("login");
  });
  it("sends kitchen-only users to the kitchen", () => {
    expect(resolveLanding(null, kitchenMgr, null)).toBe("kitchen");
    expect(resolveLanding(null, kitchenMgr, "coffee")).toBe("kitchen");
  });
  it("ignores a stale kitchen last-space when access was removed", () => {
    expect(resolveLanding("user", null, "kitchen")).toBe("coffee");
  });
  it("uses last space for coffee users with kitchen access", () => {
    expect(resolveLanding("user", coffeeMgr, null)).toBe("coffee");
    expect(resolveLanding("user", coffeeMgr, "coffee")).toBe("coffee");
    expect(resolveLanding("user", coffeeMgr, "kitchen")).toBe("kitchen");
  });
  it("never lands non-client coffee roles in the kitchen automatically", () => {
    expect(resolveLanding("admin", storesMgr, "kitchen")).toBe("coffee");
    expect(resolveLanding("roaster", null, null)).toBe("coffee");
  });
});

describe("canSwitchSpaces", () => {
  it("is false without kitchen access", () => {
    expect(canSwitchSpaces("user", null)).toBe(false);
    expect(canSwitchSpaces("admin", null)).toBe(false);
  });
  it("is false for kitchen-only users", () => {
    expect(canSwitchSpaces(null, kitchenMgr)).toBe(false);
  });
  it("is true for coffee users and admins with kitchen access", () => {
    expect(canSwitchSpaces("user", storesMgr)).toBe(true);
    expect(canSwitchSpaces("admin", storesMgr)).toBe(true);
  });
  it("is false for roaster and packaging", () => {
    expect(canSwitchSpaces("roaster", storesMgr)).toBe(false);
    expect(canSwitchSpaces("packaging", storesMgr)).toBe(false);
  });
});

describe("last space persistence", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips through localStorage key pr_space", () => {
    expect(loadLastSpace()).toBeNull();
    saveLastSpace("kitchen");
    expect(localStorage.getItem("pr_space")).toBe("kitchen");
    expect(loadLastSpace()).toBe("kitchen");
    saveLastSpace("coffee");
    expect(loadLastSpace()).toBe("coffee");
  });
  it("ignores garbage values", () => {
    localStorage.setItem("pr_space", "bogus");
    expect(loadLastSpace()).toBeNull();
  });
});

describe("showsSpaceSwitch", () => {
  it("shows the pill on onboarding so a coffee+kitchen user can reach the Kitchen", () => {
    expect(showsSpaceSwitch("onboarding", "user")).toBe(true);
  });
  it("shows it on the client views and the kitchen view", () => {
    for (const v of ["home", "shop", "orders", "account", "checkout", "kitchen"]) expect(showsSpaceSwitch(v, "user")).toBe(true);
  });
  it("shows it on admin only for admins, never on reset-password or staff dashboards", () => {
    expect(showsSpaceSwitch("admin", "admin")).toBe(true);
    expect(showsSpaceSwitch("admin", "user")).toBe(false);
    for (const v of ["reset-password", "roaster_dashboard", "packaging_dashboard"]) expect(showsSpaceSwitch(v, "admin")).toBe(false);
  });
});
