// Decides where a signed-in user lands (coffee app, Kitchen, or login) and
// whether they may switch between the two spaces. Kept free of React and
// Supabase so it is trivially testable and stays tiny in the main bundle.

export type AppRole = "admin" | "user" | "roaster" | "packaging";

export type KitchenRole = "coffee_manager" | "stores_manager" | "kitchen_manager";

export type KitchenAccess = {
  role: KitchenRole;
  cafeId: string | null;
  cafeName: string | null;
};

export type Space = "coffee" | "kitchen";

const SPACE_KEY = "pr_space";

export function loadLastSpace(): Space | null {
  try {
    const v = localStorage.getItem(SPACE_KEY);
    return v === "coffee" || v === "kitchen" ? v : null;
  } catch {
    return null;
  }
}

export function saveLastSpace(s: Space): void {
  try { localStorage.setItem(SPACE_KEY, s); } catch { /* ignore */ }
}

/** True only for coffee clients ("user") and admins who also have Kitchen access. */
export function canSwitchSpaces(coffeeRole: AppRole | null, kitchen: KitchenAccess | null): boolean {
  if (!kitchen) return false;
  return coffeeRole === "user" || coffeeRole === "admin";
}

// Views on which a user allowed to switch spaces sees the Coffee/Kitchen pill. Onboarding is
// included so a client with Kitchen access is not stuck there before finishing coffee onboarding.
const SPACE_SWITCH_VIEWS = ["home", "shop", "orders", "account", "checkout", "kitchen", "onboarding"];

/** Whether the pill is shown on this view (who may switch is decided by canSwitchSpaces). */
export function showsSpaceSwitch(view: string, coffeeRole: AppRole | null): boolean {
  return SPACE_SWITCH_VIEWS.includes(view) || (view === "admin" && coffeeRole === "admin");
}

/**
 * - No coffee role and no Kitchen access → login.
 * - Kitchen-only → kitchen.
 * - Coffee client with Kitchen access → the last space they used (default coffee).
 * - Everyone else (incl. admin/roaster/packaging) → coffee side (their own dashboard).
 * A stale "kitchen" last-space without Kitchen access is ignored.
 */
export function resolveLanding(
  coffeeRole: AppRole | null,
  kitchen: KitchenAccess | null,
  lastSpace: Space | null,
): "login" | "coffee" | "kitchen" {
  if (!coffeeRole) return kitchen ? "kitchen" : "login";
  if (coffeeRole === "user" && kitchen && lastSpace === "kitchen") return "kitchen";
  return "coffee";
}

type KitchenAccessRow = { role: KitchenRole; cafe_id: string | null; cafe_name: string | null };

/** Maps the first row of get_my_kitchen_access() to KitchenAccess (null when none). */
export function toKitchenAccess(rows: KitchenAccessRow[] | null | undefined): KitchenAccess | null {
  const row = rows?.[0];
  if (!row) return null;
  return { role: row.role, cafeId: row.cafe_id ?? null, cafeName: row.cafe_name ?? null };
}
