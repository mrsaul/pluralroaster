export type KitchenAccessInput = {
  coffeeRole: string; // "admin" | "user" | "roaster" | "packaging" | "none"
  kitchenRole: string | null; // "coffee_manager" | "stores_manager" | "kitchen_manager" | null
  cafeId: string | null;
};

export type KitchenAccessResult =
  | { ok: true }
  | { ok: false; error: "coffee_manager_needs_cafe" | "needs_some_access" };

// NOTE: the same rules are mirrored in supabase/functions/invite-user/index.ts.
export function validateKitchenAccess(input: KitchenAccessInput): KitchenAccessResult {
  if (input.coffeeRole === "none" && !input.kitchenRole) {
    return { ok: false, error: "needs_some_access" };
  }
  if (input.kitchenRole === "coffee_manager" && !input.cafeId) {
    return { ok: false, error: "coffee_manager_needs_cafe" };
  }
  return { ok: true };
}
