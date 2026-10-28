# Plural Kitchen — Internal Food Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an invite-only "Kitchen" space to pluralroaster where coffee managers order food from Plural Kitchen, the stores manager reviews and approves, and the kitchen manager plans production, stock and capacity.

**Architecture:** Kitchen data lives in new `kitchen_*` Postgres tables. All writes with rules (status changes, cutoff, edit locks, stock) go through `SECURITY DEFINER` RPCs; reads go through RLS. Kitchen access is a separate `kitchen_members` record, not an `app_role`, so a user can be coffee-only, kitchen-only, or both. All Kitchen UI lives under `src/kitchen/` and is lazy-loaded only for users with kitchen access. `Index.tsx` gains one access lookup, a kitchen view and a Coffee/Kitchen switch.

**Tech Stack:** React 18 + Vite + TypeScript, shadcn/ui + Tailwind, TanStack Query v5, Supabase (Postgres + RLS + RPC + Edge Functions + pg_cron), Vitest, pgTAP (`supabase test db`), `npm:web-push@3.6.7`, Resend.

**Spec:** `docs/superpowers/specs/2026-10-26-kitchen-orders-design.md`

## Global Constraints

- Quantities only: no price, cost or invoice column on any `kitchen_*` table. No Sellsy or Shopify calls from Kitchen code.
- No change to existing coffee tables (`orders`, `order_items`, `products`, `product_variants`, `delivery_dates`, `companies`, …) or to coffee order flows.
- Coffee-only users must never see anything related to food or the Kitchen: no switch, menu item, route, empty state, badge, notification, email or Kitchen wording, and Kitchen screens are not loaded for them. Kitchen strings live only in `src/kitchen/` (lazy chunk).
- RLS on every `kitchen_*` table. Coffee-only users get zero rows from every kitchen table and every kitchen RPC raises `not_kitchen_member`.
- Time zone for cutoff and weeks: `Europe/Paris`. A production week starts Monday (`week_start` is a Monday `date`).
- Default settings: cutoff **Sunday 20:00**, reminder **2 h** before cutoff, weekly capacity **30 h** (1800 min).
- French default, English available (existing `useLang()`), all Kitchen copy in both.
- Seed products (placeholders, editable): Banana bread — "Whole cake", 1 piece, 60 min; Pandebono — "Batch", 50, 90 min; Empanadas — "Batch", 30, 120 min; Cookies — "Batch", 50, 60 min.
- WhatsApp = share text only (`navigator.share`, clipboard fallback, same pattern as `CheckoutPage.tsx:184-206`). No WhatsApp Business API.
- Existing coffee clients, admin, roaster and packaging logins must behave exactly as before.
- **Prerequisite for DB tests:** Docker Desktop running (not installed on this machine as of 2026-10-26), then `supabase start` once. pgTAP tests live in `supabase/tests/` and run with `supabase test db`.

## Review Focus

1. **Coffee-only client and the Kitchen bundle**: a coffee-only login must not download the Kitchen chunk or see any Kitchen string. Expected: kitchen strings absent from the main bundle; `SpaceSwitch` not rendered. Pinned in Task 6 (bundle grep + landing tests).
2. **Kitchen-only user logging in for the first time**: `ensure_current_user_role` must not create a `user` row for them, and `Index.tsx` must not normalise `NULL` to `"user"` (it does today, `Index.tsx:235-238`). Expected: lands in Kitchen, no coffee catalog. Pinned in Task 1 (pgTAP) and Task 6 (vitest).
3. **Café edits while the stores manager is editing the same order**: expected: the café's edit is refused with `order_locked`, and the lock expires after 10 minutes so a closed tab doesn't block forever. Pinned in Task 3.
4. **Actions just after the cutoff** (café sends or edits at Sunday 20:00:30): expected: refused with `cutoff_passed`, while the stores manager can still edit and approve that week. Pinned in Task 3 and Task 4.
5. **Marking ready with less stock than ordered, or stock edited to below zero**: expected: stock never goes negative; `served_from_stock_units = least(stock, units)`; to-produce never negative. Pinned in Task 4 (pgTAP) and Task 7 (vitest).

---

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261027000001_kitchen_access.sql` | `kitchen_role` enum, `kitchen_cafes`, `kitchen_members`, access helpers, `get_my_kitchen_access()`, `ensure_current_user_role` change |
| `supabase/migrations/20261027000002_kitchen_catalog.sql` | `kitchen_products`, `kitchen_settings`, week/cutoff functions, seed |
| `supabase/migrations/20261027000003_kitchen_orders.sql` | `kitchen_orders`, `kitchen_order_items`, `kitchen_order_history`, café-side RPCs, edit lock |
| `supabase/migrations/20261027000004_kitchen_review.sql` | stores-manager and kitchen-manager RPCs, stock on ready |
| `supabase/migrations/20261027000005_kitchen_reminders.sql` | `kitchen_reminders_sent`, pg_cron schedule |
| `supabase/tests/kitchen_*.test.sql` | pgTAP tests per migration |
| `supabase/functions/invite-user/index.ts` | kitchen access on invite, `set-kitchen-access` action, list includes kitchen-only users |
| `supabase/functions/notify-kitchen/index.ts` | push (fallback email) for kitchen events and cutoff reminders |
| `src/lib/landing.ts` | pure landing/switch decision (in main bundle, no Kitchen wording) |
| `src/components/SpaceSwitch.tsx` | Coffee/Kitchen pill, rendered only for users with both |
| `src/pages/Index.tsx` | access lookup, `kitchen` view, kitchen-only routing |
| `src/components/UserManagementView.tsx` | Kitchen access column and editor (admin only) |
| `src/kitchen/KitchenApp.tsx` | lazy entry: picks screen by kitchen role |
| `src/kitchen/i18n.ts` | fr/en Kitchen strings, `useKitchenT()` |
| `src/kitchen/lib/production.ts` | production and capacity math |
| `src/kitchen/lib/share.ts` | WhatsApp share texts |
| `src/kitchen/lib/format.ts` | countdown, units → pieces, minutes → hours |
| `src/kitchen/api.ts` | TanStack Query hooks + RPC wrappers + notify calls |
| `src/kitchen/cafe/*` | coffee manager screens |
| `src/kitchen/stores/*` | stores manager screens |
| `src/kitchen/kitchen/*` | kitchen manager screens |
| `src/test/kitchen-*.test.ts(x)` | Vitest tests |

---

### Task 1: Kitchen access foundation

**Files:**
- Create: `supabase/migrations/20261027000001_kitchen_access.sql`
- Create: `supabase/tests/kitchen_access.test.sql`

**Interfaces:**
- Produces:
  - `type kitchen_role = 'coffee_manager' | 'stores_manager' | 'kitchen_manager'`
  - `kitchen_cafes(id uuid pk, name text not null unique, is_active bool default true, created_at timestamptz)`
  - `kitchen_members(user_id uuid pk → auth.users on delete cascade, role kitchen_role not null, cafe_id uuid null → kitchen_cafes, created_at, check (role <> 'coffee_manager' or cafe_id is not null))`
  - `kitchen_role_of(uid uuid) returns kitchen_role` (stable, security definer, NULL if none)
  - `kitchen_cafe_of(uid uuid) returns uuid`
  - `get_my_kitchen_access() returns table(role kitchen_role, cafe_id uuid, cafe_name text)`: zero rows for non-members
  - `ensure_current_user_role()`: unchanged, **except** when the caller has no `user_roles` row **and** has a `kitchen_members` row, it returns `NULL` and inserts nothing.
- RLS: `kitchen_cafes` select for kitchen members and `has_role(auth.uid(),'admin')`; insert/update admin only. `kitchen_members` select own row, or all rows for admin; writes admin only (service role bypasses).

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/kitchen_access.test.sql`. Insert test users into `auth.users` directly and act as each one with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}';` (reset with `reset role`). Put the user/café setup in `supabase/tests/kitchen_setup.sql` and include it from every kitchen test file with `\ir kitchen_setup.sql`. Users: `coffee_client` (user_roles `user`), `kitchen_only` (kitchen_manager), `both` (user_roles `user` + coffee_manager of café A), `admin`. Assertions:
  - `ensure_current_user_role()` as `kitchen_only` → `NULL`, and `user_roles` has 0 rows for them.
  - `ensure_current_user_role()` as a brand-new user with no rows → `'user'` (unchanged behaviour).
  - `ensure_current_user_role()` as `both` → `'user'`.
  - `get_my_kitchen_access()` as `coffee_client` → 0 rows; as `both` → `('coffee_manager', A, 'Artivistas')`.
  - As `coffee_client`: `select count(*) from kitchen_cafes` = 0, `from kitchen_members` = 0.
  - As `both`: `kitchen_members` returns only their own row.
- [ ] **Step 2: Run** `supabase test db`. Expected: FAIL (relation `kitchen_cafes` does not exist).
- [ ] **Step 3: Write the migration** with the interfaces above. Re-create `ensure_current_user_role()` from `20260325134824_…sql` and add the kitchen-only early return before the `INSERT`.
- [ ] **Step 4: Run** `supabase test db`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): access model (cafés, members, kitchen-only login)`

---

### Task 2: Catalog, settings and production weeks

**Files:**
- Create: `supabase/migrations/20261027000002_kitchen_catalog.sql`
- Create: `supabase/tests/kitchen_catalog.test.sql`

**Interfaces:**
- Consumes: `kitchen_role_of`, `kitchen_members` (Task 1).
- Produces:
  - `kitchen_products(id uuid pk, name text not null, photo_url text, unit_label text not null, pieces_per_unit int not null check (>0), stock_units int not null default 0 check (>=0), production_minutes int not null default 0 check (>=0), is_visible bool not null default true, sort_order int default 0, created_at, updated_at)` + the 4 seed rows from Global Constraints.
  - `kitchen_settings(id int pk check (id = 1), cutoff_weekday int not null default 0 check (0..6, 0 = Sunday), cutoff_time time not null default '20:00', reminder_hours_before int not null default 2, weekly_capacity_minutes int not null default 1800, updated_at)`, one seeded row.
  - `kitchen_cutoff_for_week(p_week_start date) returns timestamptz`: the last `cutoff_weekday` at `cutoff_time` (Europe/Paris) strictly before `p_week_start 00:00` Paris.
  - `kitchen_now() returns timestamptz`: `coalesce(nullif(current_setting('kitchen.now_override', true), '')::timestamptz, now())`. Every kitchen function uses it instead of `now()`, so tests can freeze time.
  - `kitchen_current_week(p_now timestamptz default kitchen_now()) returns table(week_start date, cutoff_at timestamptz)`: the earliest Monday whose cutoff is after `p_now`.
- RLS: products select for any kitchen member, but `coffee_manager` only where `is_visible`; insert/update/delete only `kitchen_manager`. Settings select any kitchen member; update only `kitchen_manager`. Coffee-only: nothing.

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/kitchen_catalog.test.sql`:
  - `kitchen_cutoff_for_week('2026-11-02')` = `'2026-11-01 20:00 Europe/Paris'`.
  - `kitchen_current_week('2026-11-01 19:59 Europe/Paris')` → week_start `2026-11-02`; at `'2026-11-01 20:00 Europe/Paris'` → `2026-11-09`.
  - DST: `kitchen_cutoff_for_week('2026-03-30')` = `'2026-03-29 20:00 Europe/Paris'` (the DST change day).
  - With `cutoff_weekday = 6`, `cutoff_time = '18:00'`: `kitchen_cutoff_for_week('2026-11-02')` = `'2026-10-31 18:00 Europe/Paris'`.
  - Coffee manager sees 3 products after Cookies is set hidden; kitchen manager sees 4.
  - Coffee manager `update kitchen_products set stock_units = 9` affects 0 rows; kitchen manager affects 1.
  - Kitchen manager setting `stock_units = -1` raises check violation.
  - Coffee-only client sees 0 products and 0 settings rows.
- [ ] **Step 2: Run** `supabase test db`. Expected: FAIL.
- [ ] **Step 3: Write the migration** per the interfaces.
- [ ] **Step 4: Run** `supabase test db`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): catalog, settings and production weeks`

---

### Task 3: Orders and the café-side flow

**Files:**
- Create: `supabase/migrations/20261027000003_kitchen_orders.sql`
- Create: `supabase/tests/kitchen_orders.test.sql`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `kitchen_orders(id uuid pk, cafe_id uuid not null, week_start date not null, kind text not null check in ('weekly','urgent'), status text not null check in ('draft','sent','approved','ready','received','declined'), urgent_reason text, needed_by timestamptz, ready_eta timestamptz, decline_note text, created_by uuid, sent_at, approved_by uuid, approved_at, ready_at, received_at, locked_by uuid, locked_at timestamptz, created_at, updated_at)` + unique index `(cafe_id, week_start) where kind = 'weekly'`.
  - `kitchen_order_items(id uuid pk, order_id uuid → kitchen_orders on delete cascade, product_id uuid → kitchen_products, product_name text, unit_label text, pieces_per_unit int, production_minutes int, units int not null check (>=0), adjusted_units int check (>=0), served_from_stock_units int not null default 0, unique (order_id, product_id))`. Snapshots are copied from the product when the line is created. Effective units = `coalesce(adjusted_units, units)`.
  - `kitchen_order_history(id, order_id, status text, changed_by uuid, note text, created_at)`: one row per status change.
  - `kitchen_get_or_create_draft(p_cafe_id uuid default null) returns uuid`: weekly order for `kitchen_current_week()`. `p_cafe_id` is ignored for coffee managers (always their café) and required for the stores manager.
  - `kitchen_set_item(p_order_id uuid, p_product_id uuid, p_units int) returns void`: upsert the line, delete it when `p_units = 0`. Coffee manager: own café, before cutoff, order status `draft|sent|approved`. If status is `approved` it becomes `sent` (history row, note `'edited by café'`). Raises `order_locked` when `locked_by` is another user and `locked_at > now() - interval '10 minutes'`. Raises `cutoff_passed` after `kitchen_cutoff_for_week(week_start)`. Raises `product_hidden` if the product is not visible.
  - `kitchen_send_order(p_order_id uuid) returns void`: `draft → sent`, requires ≥ 1 line with units > 0, raises `cutoff_passed` for coffee managers.
  - `kitchen_mark_received(p_order_id uuid) returns void`: café only, `ready → received`.
  - Error codes are raised as `RAISE EXCEPTION '<code>'` so the client can map them: `not_kitchen_member`, `forbidden`, `cutoff_passed`, `order_locked`, `invalid_status`, `invalid_input`, `empty_order`, `product_hidden`.
- RLS select: coffee manager → own café's orders, items and history; stores manager and admin → all; kitchen manager → orders with status in `('approved','ready','received')` and their items/history. No direct insert/update/delete for `authenticated` (RPCs only).

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/kitchen_orders.test.sql`. Freeze time with `set local kitchen.now_override = '…'` (Task 2's `kitchen_now()`). Assertions:
  - Café A manager: `kitchen_get_or_create_draft()` twice → same id; `kitchen_set_item` 2 pandebono → item has `pieces_per_unit = 50`, `production_minutes = 90` snapshots.
  - Kitchen manager changes pandebono to 40 pieces afterwards → existing item still 50.
  - `kitchen_send_order` on an empty order → `empty_order`.
  - Send → status `sent`, 1 history row.
  - After approval (set directly as superuser in the test), café `kitchen_set_item` → status back to `sent`, history note `'edited by café'`.
  - Stores manager holds the lock (`locked_by`, `locked_at = now`) → café `kitchen_set_item` raises `order_locked`; with `locked_at = now - 11 min` → succeeds.
  - At cutoff + 30 s: café `kitchen_set_item` and `kitchen_send_order` raise `cutoff_passed`.
  - Café B manager cannot see café A's order (0 rows) and `kitchen_set_item` on it raises `forbidden`.
  - Kitchen manager sees 0 rows while the order is `sent`, 1 row once `approved`.
  - Coffee-only client: 0 rows on all three tables; `kitchen_get_or_create_draft()` raises `not_kitchen_member`.
  - Hidden product → `product_hidden`.
- [ ] **Step 2: Run** `supabase test db`. Expected: FAIL.
- [ ] **Step 3: Write the migration** per the interfaces.
- [ ] **Step 4: Run** `supabase test db`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): orders, drafts, café edits with cutoff and lock`

---

### Task 4: Review, urgent orders, ready and stock

**Files:**
- Create: `supabase/migrations/20261027000004_kitchen_review.sql`
- Create: `supabase/tests/kitchen_review.test.sql`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (all `security definer`, all write a history row on status change):
  - `kitchen_lock_order(p_order_id uuid) returns void` / `kitchen_unlock_order(p_order_id uuid) returns void`: stores manager. Locking an order locked by another stores manager within 10 min raises `order_locked`.
  - `kitchen_adjust_item(p_order_id uuid, p_product_id uuid, p_adjusted_units int) returns void`: stores manager, any time (no cutoff), order not `ready|received|declined`. Creates the line with `units = 0` if the stores manager adds a product the café didn't order.
  - `kitchen_approve_order(p_order_id uuid) returns jsonb`: stores manager, `sent → approved`, clears lock, returns `{"changes":[{"product_name","from","to"}]}` for lines where `adjusted_units is distinct from units`.
  - `kitchen_decline_order(p_order_id uuid, p_note text) returns void`: stores manager, urgent orders only, `sent → declined`.
  - `kitchen_create_urgent_order(p_cafe_id uuid, p_reason text, p_needed_by timestamptz, p_items jsonb) returns uuid`: `p_items = [{"product_id","units"}]`. Coffee manager (own café, `p_cafe_id` ignored) or stores manager. Status `sent`, kind `urgent`, `week_start` = Monday of `p_needed_by` in Paris time. Reason required. No cutoff check.
  - `kitchen_set_ready_eta(p_order_id uuid, p_eta timestamptz) returns void`: kitchen manager, approved urgent orders.
  - `kitchen_mark_ready(p_order_id uuid) returns void`: kitchen manager, `approved → ready`. For each line: `served = least(product.stock_units, effective units)`, `product.stock_units -= served`, `item.served_from_stock_units = served`, all in one transaction with `select … for update` on the products.
  - `kitchen_create_order_for_cafe(p_cafe_id uuid) returns uuid`: stores manager, = `kitchen_get_or_create_draft(p_cafe_id)` but allowed after cutoff, and returns the existing weekly order if there is one.

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/kitchen_review.test.sql`:
  - Café sends cookies 1 batch; stores manager `kitchen_adjust_item(cookies, 0)` and adds banana bread 1 → `kitchen_approve_order` returns changes `[{Cookies,1,0},{Banana bread,0,1}]`, status `approved`, lock cleared.
  - Stores manager adjusts and approves at cutoff + 1 h → succeeds.
  - Coffee manager calling `kitchen_approve_order` → `forbidden`.
  - Urgent order with empty reason → `invalid_input`. Valid urgent with `needed_by = '2026-11-04 10:00 Paris'` → `week_start = '2026-11-02'`, status `sent`.
  - `kitchen_decline_order` on a weekly order → `invalid_status`.
  - Stock 1 batch pandebono, approved order 3 batches → `kitchen_mark_ready` → stock 0, `served_from_stock_units = 1`. Second order of 2 → served 0, stock stays 0.
  - `kitchen_mark_ready` on a `sent` order → `invalid_status`.
  - Café `kitchen_mark_received` on `ready` → `received`.
  - Coffee-only client: every RPC above raises `not_kitchen_member`.
- [ ] **Step 2: Run** `supabase test db`. Expected: FAIL.
- [ ] **Step 3: Write the migration** per the interfaces.
- [ ] **Step 4: Run** `supabase test db`. Expected: PASS.
- [ ] **Step 5: Regenerate types:** `supabase gen types typescript --local > src/integrations/supabase/types.ts`. Run `npx tsc --noEmit -p tsconfig.app.json`. Expected: no new errors.
- [ ] **Step 6: Commit** `feat(kitchen): review, urgent orders, ready with stock`

---

### Task 5: Admin manages Kitchen access

**Files:**
- Modify: `supabase/functions/invite-user/index.ts:58-120` (invite), `:185-215` (list), new action
- Modify: `src/components/UserManagementView.tsx`
- Test: `src/test/kitchen-access-form.test.ts`

**Interfaces:**
- Produces:
  - `invite` action body: `{ email, role: "admin"|"user"|"roaster"|"packaging"|"none", kitchen?: { role: "coffee_manager"|"stores_manager"|"kitchen_manager", cafeId?: string } }`. `role: "none"` is allowed only with `kitchen` and writes no `user_roles` row. With `kitchen`, upsert `kitchen_members` for the invited or existing user. An existing user's coffee role is still replaced exactly as today when `role` is not `"none"`.
  - New action `set-kitchen-access`: `{ userId, kitchen: {role, cafeId?} | null }`. `null` deletes the `kitchen_members` row. Admin only, like the other actions.
  - New action `list-cafes` / `upsert-cafe` `{ id?, name, isActive }`.
  - `list` returns every user with a `user_roles` row **or** a `kitchen_members` row, with new fields `kitchenRole: string | null`, `cafeId: string | null`, `cafeName: string | null`. `role` is `null` for kitchen-only users.
  - `src/components/kitchenAccessForm.ts` (main bundle, admin only, no food wording beyond role labels): `validateKitchenAccess(input: { coffeeRole: string; kitchenRole: string | null; cafeId: string | null }): { ok: true } | { ok: false; error: "coffee_manager_needs_cafe" | "needs_some_access" }`.

- [ ] **Step 1: Write the failing test** `src/test/kitchen-access-form.test.ts`:
  - `{coffeeRole:"none", kitchenRole:null, cafeId:null}` → `needs_some_access`.
  - `{coffeeRole:"user", kitchenRole:"coffee_manager", cafeId:null}` → `coffee_manager_needs_cafe`.
  - `{coffeeRole:"none", kitchenRole:"kitchen_manager", cafeId:null}` → ok.
  - `{coffeeRole:"user", kitchenRole:"stores_manager", cafeId:null}` → ok.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-access-form.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `validateKitchenAccess` and the edge-function changes. Mirror the same validation inside the function (400 with the error code).
- [ ] **Step 4: Update `UserManagementView.tsx`:** invite dialog gets a "Coffee access" select (existing roles + "No coffee access") and a "Kitchen access" select (None / Coffee manager / Stores manager / Kitchen manager) with a café select shown for Coffee manager. The user table gets a "Kitchen" badge column. Row menu gets "Edit Kitchen access" → `set-kitchen-access`. Add a small "Cafés" card to add/rename/deactivate cafés. `AppRole` here accepts `null` for kitchen-only rows.
- [ ] **Step 5: Run** `npx vitest run src/test/kitchen-access-form.test.ts`. Expected: PASS.
- [ ] **Step 6: Manual check** (local `supabase functions serve invite-user`): invite kitchen-only → no `user_roles` row, `kitchen_members` row present; give Kitchen access to an existing coffee client → `user_roles` unchanged; list shows both.
- [ ] **Step 7: Commit** `feat(kitchen): admin invites and manages Kitchen access`

---

### Task 6: App shell — landing, switch, lazy Kitchen

**Files:**
- Create: `src/lib/landing.ts`, `src/components/SpaceSwitch.tsx`, `src/kitchen/KitchenApp.tsx` (placeholder screen per role for now), `src/kitchen/i18n.ts`
- Modify: `src/pages/Index.tsx:46-47` (types), `:229-255` (`syncUserRole`), `:529` (`if (!role)`), `switch (view)` (new `"kitchen"` case)
- Test: `src/test/landing.test.ts`, `src/test/space-switch.test.tsx`

**Interfaces:**
- Consumes: `get_my_kitchen_access()` (Task 1).
- Produces:
  - `type KitchenAccess = { role: "coffee_manager"|"stores_manager"|"kitchen_manager"; cafeId: string | null; cafeName: string | null }`, exported from `src/lib/landing.ts`.
  - `type Space = "coffee" | "kitchen"`.
  - `resolveLanding(coffeeRole: AppRole | null, kitchen: KitchenAccess | null, lastSpace: Space | null): "login" | "coffee" | "kitchen"`.
  - `canSwitchSpaces(coffeeRole: AppRole | null, kitchen: KitchenAccess | null): boolean`: true only for `coffeeRole === "user"` with kitchen access, or `admin` with kitchen access.
  - `loadLastSpace(): Space | null` / `saveLastSpace(s: Space): void` in localStorage key `pr_space` (try/catch).
  - `SpaceSwitch({ current, onChange }: { current: Space; onChange: (s: Space) => void })`: two-segment pill. Labels come from the main i18n file as `t.space.coffee` / `t.space.kitchen` (fr "Café" / "Cuisine", en "Coffee" / "Kitchen"). These are the only Kitchen-related words allowed in the main bundle, and they render only when `canSwitchSpaces` is true.
  - `renderSpaceSwitchIfAllowed(coffeeRole: AppRole | null, kitchen: KitchenAccess | null, current: Space, onChange: (s: Space) => void): JSX.Element | null` exported from `SpaceSwitch.tsx`.
  - `KitchenApp({ access, onLogout, onSwitchToCoffee }: { access: KitchenAccess; onLogout: () => void; onSwitchToCoffee?: () => void })`: default export, lazy-loaded.
  - `useKitchenT(): KitchenStrings` in `src/kitchen/i18n.ts` (reads `useLang()`).

- [ ] **Step 1: Write the failing tests** `src/test/landing.test.ts`:
  - `resolveLanding(null, null, null)` → `"login"`.
  - `resolveLanding(null, {role:"kitchen_manager",…}, null)` → `"kitchen"`.
  - `resolveLanding("user", null, "kitchen")` → `"coffee"` (stale `pr_space` from a removed access is ignored).
  - `resolveLanding("user", coffeeMgr, null)` → `"coffee"`; with `"kitchen"` → `"kitchen"`.
  - `canSwitchSpaces("user", null)` → false; `canSwitchSpaces(null, kitchenMgr)` → false; `canSwitchSpaces("user", storesMgr)` → true; `canSwitchSpaces("roaster", storesMgr)` → false.

  `src/test/space-switch.test.tsx`: `renderSpaceSwitchIfAllowed("user", null, "coffee", noop)` → `null`, so a render has `queryByText(/cuisine|kitchen/i)` null; with a stores-manager access it renders both labels.
- [ ] **Step 2: Run** `npx vitest run src/test/landing.test.ts src/test/space-switch.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `landing.ts`, `SpaceSwitch.tsx`, `src/kitchen/i18n.ts` (empty-ish fr/en dictionaries plus `useKitchenT`), and the placeholder `KitchenApp`.
- [ ] **Step 4: Wire `Index.tsx`:** in `syncUserRole`, stop normalising unknown/`NULL` to `"user"` (keep `NULL`), then call `supabase.rpc("get_my_kitchen_access")` and store `kitchenAccess`. Replace `if (!role)` with `resolveLanding(...) === "login"`. Add `view === "kitchen"` → `<Suspense><KitchenApp …/></Suspense>` with `KitchenApp = lazy(() => import("@/kitchen/KitchenApp"))`. Render `SpaceSwitch` (fixed, top-right) only when `canSwitchSpaces`. Kitchen-only users always render `KitchenApp`.
- [ ] **Step 5: Run** `npm test`. Expected: all tests pass (existing ones included).
- [ ] **Step 6: Bundle check:** `npm run build`, then `grep -il "pandebono\|kitchen_orders\|kitchen_set_item\|production_minutes" dist/assets/index-*.js`. Expected: no match (Kitchen code only in the lazy chunk; `get_my_kitchen_access` in the main chunk is expected).
- [ ] **Step 7: Commit** `feat(kitchen): kitchen-only landing, Coffee/Kitchen switch, lazy Kitchen app`

---

### Task 7: Production, capacity, share and format helpers

**Files:**
- Create: `src/kitchen/lib/production.ts`, `src/kitchen/lib/share.ts`, `src/kitchen/lib/format.ts`, `src/kitchen/types.ts`
- Test: `src/test/kitchen-production.test.ts`, `src/test/kitchen-share.test.ts`, `src/test/kitchen-format.test.ts`

**Interfaces:**
- Produces (`src/kitchen/types.ts`):
  - `KitchenProduct = { id; name; unitLabel; piecesPerUnit: number; stockUnits: number; productionMinutes: number; isVisible: boolean }`
  - `KitchenOrderItem = { productId; productName; unitLabel; piecesPerUnit: number; units: number; adjustedUnits: number | null; servedFromStockUnits: number }`
  - `KitchenOrder = { id; cafeId; cafeName; weekStart: string; kind: "weekly"|"urgent"; status: "draft"|"sent"|"approved"|"ready"|"received"|"declined"; urgentReason: string|null; neededBy: string|null; readyEta: string|null; items: KitchenOrderItem[] }`
- `production.ts`:
  - `effectiveUnits(item: KitchenOrderItem): number`
  - `computeProduction(orders: KitchenOrder[], products: KitchenProduct[]): ProductionRow[]` where `ProductionRow = { productId; name; unitLabel; orderedUnits: number; byCafe: { cafeName: string; units: number }[]; stockUnits: number; toProduceUnits: number }`. Counts only `status === "approved"` (ready orders already took their stock). `toProduceUnits = max(0, ordered − stock)`. Rows sorted like products; products with 0 ordered are omitted.
  - `computeCapacity(rows: ProductionRow[], products: KitchenProduct[], availableMinutes: number): { neededMinutes: number; availableMinutes: number; overByMinutes: number }`. Needed = Σ `toProduceUnits × product.productionMinutes` (current product time). `overByMinutes = max(0, needed − available)`.
  - `capacityIfApproved(orders, pending: KitchenOrder, products, availableMinutes)`: same as above with `pending` treated as approved.
- `share.ts`:
  - `buildOrderShareText(order: KitchenOrder, lang: Lang): string`
  - `buildChangesShareText(cafeName: string, changes: {productName: string; from: number; to: number}[], lang: Lang): string`
  - `buildProductionShareText(weekStart: string, rows: ProductionRow[], lang: Lang): string`
  - `buildPackingListText(order: KitchenOrder, lang: Lang): string`
- `format.ts`:
  - `formatCountdown(cutoffAt: Date, now: Date, lang: Lang): string` (e.g. fr `"dans 1 j 4 h"`, en `"in 1 d 4 h"`, `"< 1 h"` under an hour, `""` when passed)
  - `unitsToPieces(units: number, piecesPerUnit: number): number`
  - `formatMinutes(min: number): string` (`2040` → `"34 h"`, `90` → `"1 h 30"`)

- [ ] **Step 1: Write the failing tests** with the spec's example:
  - Orders: Artivistas approved pandebono 1, cookies 1 (adjusted from 1 to 0 → excluded from total), banana bread 1; New café approved pandebono 2, cookies 1; a `sent` order of pandebono 5 (ignored); a `ready` order (ignored). Pandebono stock 1. Expect pandebono row `{orderedUnits: 3, byCafe: [Artivistas 1, New café 2], stockUnits: 1, toProduceUnits: 2}`.
  - Stock 10, ordered 3 → `toProduceUnits` 0.
  - Capacity: to produce pandebono 2 × 90 + cookies 1 × 60 = 240 min, available 180 → `{neededMinutes: 240, availableMinutes: 180, overByMinutes: 60}`.
  - `capacityIfApproved` with a pending urgent pandebono 1 → needed 330.
  - `buildChangesShareText("Artivistas", [{productName:"Cookies", from: 1, to: 0}], "fr")` contains `"Cookies : 1 → 0"` and `"Artivistas"`.
  - `buildOrderShareText` lists `"Pandebono — 2 × Batch (100 pcs)"` style lines, with adjusted quantity shown as `"1 → 2"` when adjusted.
  - `formatCountdown(new Date("2026-11-01T19:00:00Z"), new Date("2026-10-31T15:00:00Z"), "en")` → `"in 1 d 4 h"`; past → `""`.
  - `formatMinutes(2040)` → `"34 h"`, `formatMinutes(90)` → `"1 h 30"`.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-*.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules.
- [ ] **Step 4: Run** `npx vitest run src/test/kitchen-*.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): production, capacity, share and format helpers`

---

### Task 8: Kitchen data layer and notifications

**Files:**
- Create: `src/kitchen/api.ts`, `supabase/functions/notify-kitchen/index.ts`, `supabase/migrations/20261027000005_kitchen_reminders.sql`
- Test: `src/test/kitchen-api.test.ts`

**Interfaces:**
- Consumes: RPCs from Tasks 3–4, types from Task 7.
- Produces (`src/kitchen/api.ts`, TanStack Query, query keys prefixed `["kitchen", …]`):
  - `useKitchenProducts()`, `useKitchenSettings()`, `useCurrentWeek()` → `{weekStart, cutoffAt}`, `useKitchenOrders(filter: { weekStart?: string; cafeId?: string; kind?: "weekly"|"urgent" })`, `useKitchenCafes()`
  - Mutations (each invalidates `["kitchen"]` and then calls `notifyKitchen` where noted): `useSetItem`, `useSendOrder` (→ `order_sent`), `useMarkReceived`, `useLockOrder`, `useUnlockOrder`, `useAdjustItem`, `useApproveOrder` (→ `order_approved` with `changes`), `useDeclineOrder` (→ `urgent_declined`), `useCreateUrgentOrder` (→ `urgent_created`), `useSetReadyEta` (→ `ready_eta`), `useMarkReady` (→ `order_ready`), `useCreateOrderForCafe`, `useUpdateProduct`, `useCreateProduct`, `useUpdateSettings`
  - `kitchenErrorMessage(err: unknown, t: KitchenStrings): string`: maps `cutoff_passed`, `order_locked`, `forbidden`, `empty_order`, `product_hidden`, `invalid_status`, `invalid_input`, `not_kitchen_member` to copy; else a generic message.
  - `notifyKitchen(event: KitchenEvent, orderId: string, extra?: object): Promise<void>`: `supabase.functions.invoke("notify-kitchen", …)`, never throws (failures logged).
  - `type KitchenEvent = "order_sent" | "order_approved" | "urgent_created" | "urgent_approved" | "urgent_declined" | "ready_eta" | "order_ready" | "cutoff_reminder"`
- `notify-kitchen` edge function: verifies the caller is a kitchen member (or the cron secret for `cutoff_reminder`). Recipients by event: `order_sent` and `urgent_created` → stores managers; `order_approved` → café's coffee managers (with the change list), plus kitchen managers when the order is urgent (`urgent_approved`); `urgent_declined`, `ready_eta`, `order_ready` → café's coffee managers. Sends web push to each recipient's `push_subscriptions` (same code path as `notify-order-status/index.ts:88-122`). Sends email via Resend only to recipients with no push subscription. Copy in French.
- Reminders migration: `kitchen_reminders_sent(week_start date, cafe_id uuid, sent_at, primary key (week_start, cafe_id))`; `cron.schedule('kitchen-cutoff-reminder', '*/15 * * * *', …)` calling `notify-kitchen` with `{event:"cutoff_reminder"}` via `pg_net` and the cron secret. The function sends to coffee managers of active cafés with no `sent|approved|ready` weekly order for the current week when `cutoff_at − reminder_hours_before ≤ now < cutoff_at`, once per café per week.

- [ ] **Step 1: Write the failing test** `src/test/kitchen-api.test.ts` (mock `supabase` like `src/test/stock.test.ts`):
  - `kitchenErrorMessage({message:"cutoff_passed"}, frStrings)` → the French cutoff copy; unknown → generic copy.
  - `notifyKitchen` resolves when `functions.invoke` rejects.
  - `useApproveOrder` success calls `functions.invoke("notify-kitchen", {body:{event:"order_approved", orderId, extra:{changes}}})`.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-api.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `api.ts`, the edge function and the reminders migration. Enable `pg_cron` and `pg_net` in the migration (`create extension if not exists`). Store the cron secret with `vault`/function secret `KITCHEN_CRON_SECRET`.
- [ ] **Step 4: Run** `npx vitest run src/test/kitchen-api.test.ts` and `supabase test db`. Expected: PASS.
- [ ] **Step 5: Manual check:** `supabase functions serve notify-kitchen`, send an order as café → stores manager's subscribed browser receives a push; a user with no subscription receives the email.
- [ ] **Step 6: Commit** `feat(kitchen): data hooks, notifications and cutoff reminder`

---

### Task 9: Coffee manager screens

**Files:**
- Create: `src/kitchen/cafe/CafeHome.tsx` (catalog + cart), `src/kitchen/cafe/CafeOrders.tsx` (this week + history), `src/kitchen/cafe/UrgentOrderSheet.tsx`
- Modify: `src/kitchen/KitchenApp.tsx` (route coffee managers here), `src/kitchen/i18n.ts`
- Test: `src/test/kitchen-cafe.test.tsx`

**Interfaces:**
- Consumes: Task 7 helpers, Task 8 hooks, existing `QuantityStepper`, `StatusBadge`-style badges, `CartBar` look.

Behaviour to build (from spec §5, §7, §8):
- Product cards: name, unit label + pieces ("Batch · 50 pcs"), stock hint ("0 in stock, will be produced" when stock 0). Hidden products never shown.
- Quantity stepper per product calls `useSetItem` on change, debounced 400 ms. The draft is server-side, so it survives closing the app and switching phones.
- Sticky bottom bar: total units, cutoff countdown (`formatCountdown`), "Send" button. After sending, the bar shows "Sent · you can still edit until Sun 20:00". Editing an approved order shows a confirm dialog "This sends the order back to the stores manager".
- After cutoff the cart is read-only with a banner and an "Urgent order" button.
- Orders screen: status timeline per order; adjusted lines shown as `1 → 2`; "Confirm received" on ready orders; share button (`buildOrderShareText`).
- Urgent sheet: items, reason (required), needed-by date-time; submit → `useCreateUrgentOrder`. Shows status steps *waiting for approval → approved → kitchen: ready <eta> → ready* / *declined: <note>*.
- `order_locked` error shows "The stores manager is reviewing this order, try again in a few minutes".

- [ ] **Step 1: Write the failing tests** `src/test/kitchen-cafe.test.tsx` (mock `src/kitchen/api.ts` hooks):
  - Renders 3 visible products, not the hidden one.
  - Product with stock 0 shows the "will be produced" hint.
  - After cutoff (mocked `useCurrentWeek` with past `cutoffAt` and a sent order) the stepper is disabled and the "Urgent order" button is visible.
  - An adjusted line renders `1 → 2`.
  - Urgent sheet submit is disabled with an empty reason.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-cafe.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screens, mobile-first, existing UI components, copy in `src/kitchen/i18n.ts` (fr + en).
- [ ] **Step 4: Run** `npx vitest run src/test/kitchen-cafe.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): coffee manager ordering screens`

---

### Task 10: Stores manager screens

**Files:**
- Create: `src/kitchen/stores/StoresReview.tsx`, `src/kitchen/stores/OrderReviewSheet.tsx`, `src/kitchen/stores/CapacityBar.tsx`
- Modify: `src/kitchen/KitchenApp.tsx`, `src/kitchen/i18n.ts`
- Test: `src/test/kitchen-stores.test.tsx`

**Interfaces:**
- Consumes: Tasks 7–8. `CapacityBar({ neededMinutes, availableMinutes, previewMinutes? }: {...})`.

Behaviour to build (spec §7 steps 4–6, §8, §9):
- Week picker (defaults to current week). Sections: **Urgent waiting** (top, sent urgent orders), **To review** (sent weekly), **Approved**, **Cafés not sent yet** (active cafés with no sent weekly order, with "Create order for this café").
- `CapacityBar` at the top: needed vs available for the week (`computeCapacity`), red when over.
- Opening an order calls `useLockOrder`; closing calls `useUnlockOrder`. Steppers call `useAdjustItem`. "Add product" adds a line. The sheet shows the capacity preview (`capacityIfApproved`). "Approve" → `useApproveOrder`, then offers "Share changes on WhatsApp" with `buildChangesShareText` when there are changes. Urgent orders also have "Decline" with a note.
- After cutoff: everything still editable for the stores manager. Café orders that were never sent are flagged "not sent", and sent-but-unapproved ones are flagged "not approved, not counted by the kitchen".
- Per café, a small "urgent orders in the last 8 weeks: N" count (from `kind = 'urgent'`), so cafés that often run short stand out.

- [ ] **Step 1: Write the failing tests** `src/test/kitchen-stores.test.tsx`:
  - `CapacityBar` with 240/180 renders "over by 1 h" and an over-capacity style; with 120/180 no over text.
  - Urgent orders render above weekly orders.
  - A café without a sent weekly order appears under "not sent yet" with the create button.
  - Opening a sheet calls the lock mutation; unmount calls unlock.
  - After cutoff, a sent weekly order shows the "not approved" flag; a café with 2 urgent orders in the fixture shows "2".
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-stores.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screens.
- [ ] **Step 4: Run** `npx vitest run src/test/kitchen-stores.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): stores manager review, approval and capacity`

---

### Task 11: Kitchen manager screens

**Files:**
- Create: `src/kitchen/kitchen/ProductionView.tsx`, `src/kitchen/kitchen/KitchenOrdersList.tsx`, `src/kitchen/kitchen/ProductsEditor.tsx`, `src/kitchen/kitchen/KitchenSettings.tsx`
- Modify: `src/kitchen/KitchenApp.tsx`, `src/kitchen/i18n.ts`
- Test: `src/test/kitchen-kitchen.test.tsx`

**Interfaces:**
- Consumes: Tasks 7–8, `CapacityBar` (Task 10).

Behaviour to build (spec §5, §6, §8, §9):
- Tabs: **Production** · **Orders** · **Products** · **Settings**.
- Production: week picker; one row per `ProductionRow` (ordered, per-café breakdown, stock, **to produce** in bold, plus pieces); `CapacityBar`; "Share production" (`buildProductionShareText`).
- Orders: approved orders for the week by café, urgent first with needed-by; "Set ready time" (urgent) → `useSetReadyEta`; "Mark ready" (confirm dialog showing what stock will be used) → `useMarkReady`; "Packing list" share (`buildPackingListText`).
- Products: list with inline edit of name, unit label, pieces per unit, stock (stepper, min 0), production time (minutes, shown as `formatMinutes`), visible toggle; "New product".
- Settings: cutoff weekday + time, reminder hours before, weekly hours available (stored as minutes).

- [ ] **Step 1: Write the failing tests** `src/test/kitchen-kitchen.test.tsx`:
  - Production tab renders the pandebono row with "to produce 2" and the "Artivistas 1 · New café 2" breakdown from Task 7's fixture.
  - Products editor refuses a negative stock (stepper min 0) and saving pieces per unit `0` shows a validation error.
  - Settings saves `30 h` as `weekly_capacity_minutes: 1800`.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-kitchen.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screens.
- [ ] **Step 4: Run** `npx vitest run src/test/kitchen-kitchen.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): kitchen manager production, products and settings`

---

### Task 12: End-to-end check and release safety

**Files:**
- Modify: `docs/superpowers/specs/2026-10-26-kitchen-orders-design.md` only if behaviour deviated (note it)
- Create: `docs/superpowers/kitchen-uat.md` (checklist results)

- [ ] **Step 1: Full test run:** `npm test`, `supabase test db`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`. Expected: all pass, no new lint errors in touched files.
- [ ] **Step 2: Bundle check** again (Task 6 Step 6). Expected: no Kitchen strings in the main chunk.
- [ ] **Step 3: Manual UAT** with local Supabase and five test accounts (coffee-only client, coffee manager Artivistas, coffee manager New café, stores manager with coffee, kitchen manager), recording pass/fail in `docs/superpowers/kitchen-uat.md`:
  1. Coffee-only client: login, catalog, checkout as before; no switch; network tab shows no request to `kitchen_*` tables and no Kitchen chunk.
  2. Existing admin, roaster and packaging logins land where they did before.
  3. Café builds a draft over two sessions, sends; stores manager adjusts 1 → 0, approves; café sees `1 → 0` and gets a push.
  4. Café edits after approval → back to "to review".
  5. After cutoff: café locked; stores manager adds an order for a café; kitchen sees it in production.
  6. Urgent order: café → stores manager approves (capacity preview shown) → kitchen sets ETA → ready → café confirms received.
  7. Mark ready subtracts stock; production view updates.
  8. Cutoff reminder fires once for a café with no sent order.
  9. Stores manager switches Coffee ↔ Kitchen; both carts kept separate.
- [ ] **Step 4: Commit** `test(kitchen): UAT checklist results`
