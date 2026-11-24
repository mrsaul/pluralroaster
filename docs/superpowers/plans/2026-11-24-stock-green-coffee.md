# Stock at bagging + green coffee to roast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stock goes down when an order is bagged (not delivered), and the Stock and Torréfaction screens show, per coffee, the roasted kilos still needed and the green kilos to weigh, with a one-tap "Torréfié" that adds to stock.

**Architecture:** A Postgres trigger on `orders` moves stock when an order's bagged state changes and records exactly what it moved (`orders.stock_deducted_at` + history rows). The to-roast arithmetic is one pure TypeScript function used by both the Stock tab "À torréfier" and the Torréfaction screen. New RPCs add roasted stock and set loss percentages (admin + roaster).

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui, TanStack Query, Vitest + Testing Library, Supabase Postgres (plpgsql).

**Spec:** `docs/superpowers/specs/2026-11-24-stock-green-coffee-design.md` (read it first; this plan argues from it).

**Worktree:** `~/dev/pr-price-breakdown`, branch `feat/stock-green-coffee`. Never work under `~/Documents` (iCloud breaks tooling). zsh: quote globs.

## Global Constraints

- Production Supabase project `wkffugaijomivqahnxom`. **No persistent database change in this plan.** The migration is applied only at release, with the owner's explicit OK. SQL tests run inside `BEGIN … ROLLBACK` (the controller runs them; implementers do not touch the database).
- "Bagged" = `is_packed = true` OR `status IN ('ready_for_delivery','delivered')`. Same definition in SQL and TypeScript.
- Coffee only: order lines with `order_items.kind = 'service'` (Loberz delivery) never count as kilos, never move stock.
- Green kg = `round2(toRoastKg × (1 + percent / 100))`; default percent **15**; per-coffee percent optional (null = default); percent allowed range **0–50** inclusive.
- `toRoastKg = max(0, neededKg − stockKg)`; stock never goes below 0 (clamp, as today).
- Open (not yet bagged) orders counted for roasting: status `received`, `approved`, `packaging` with `is_packed = false`.
- All UI copy in French, exactly as given in tasks. Phone first: cards under `md`, table from `md` up (existing pattern `md:hidden` / `hidden md:block`).
- Money/weights shown with 2 decimals (`toFixed(2)`) followed by ` kg`.
- Commit after each task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run tests with `npx vitest run <file>`; full suite `npm test`; also `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` in the final task.

## Review Focus

1. **"Passer en conditionnement" on an order still at Reçue** would skip validation (and the Sellsy draft created by "Valider"). Expect: the button only appears on `approved` orders; `received` orders show a "À valider" badge and still count toward kilos. → test in Task 6.
2. **Double tap on "Ajouter au stock"** would add the kilos twice. Expect: the button is disabled while the request is pending. → test in Task 4.
3. **French decimal comma** ("12,5") typed in the kilos or percent field. Expect: read as 12.5; empty, negative, zero kilos or a percent outside 0–50 is refused with a message and nothing is sent. → tests in Task 4.
4. **A coffee in open orders that has no stock row or is no longer active** (e.g. Nicaragua Macucane). Expect: stock counted as 0, coffee still listed, "Torréfié" creates the stock row. → tests in Tasks 1 and 2.
5. **Order unbagged then bagged again, or deleted after bagging, when stock had been clamped at 0.** Expect: put back exactly what was taken (net of history rows), never more. → tests in Task 1.

---

### Task 1: Database — stock at bagging, roasted stock, loss percentages

**Files:**
- Create: `supabase/migrations/20261124000000_stock_at_bagging.sql`
- Create: `supabase/tests/stock_at_bagging.test.sql`

**Interfaces:**
- Produces (SQL, used by Task 3):
  - `orders.stock_deducted_at timestamptz null`
  - `products.green_percent numeric null` (check 0–50)
  - table `roasting_settings(id boolean pk default true check (id), default_green_percent numeric not null default 15 check 0–50, updated_at timestamptz not null default now(), updated_by uuid null references profiles(id))`, one seeded row; RLS: select/update for admin or roaster (`has_role`).
  - `roasted_stock_history.change_type` check allows `'manual_update','order_delivered','order_packed','order_unpacked','roasted'`.
  - `add_roasted_stock(p_product_id uuid, p_kg numeric, p_note text default null) returns numeric` (new quantity). Admin/roaster only (copy the auth pattern of `update_stock_with_history` in `supabase/migrations/20261028000010_coffee_security_hardening.sql`), `p_kg > 0` else exception, creates the `roasted_stock` row (threshold 5) if missing, history `change_type='roasted'`, `delta_kg = p_kg`, `updated_by = auth.uid()`.
  - `set_green_percent(p_product_id uuid, p_percent numeric) returns void` (null resets to default; 0–50 else exception; admin/roaster).
  - `set_default_green_percent(p_percent numeric) returns void` (0–50; admin/roaster).
  - Grants: revoke from `public, anon`; grant execute to `authenticated, service_role`.

Trigger behaviour (replace `trg_decrease_stock_on_delivery` and drop `decrease_stock_on_delivery()`; all functions `SECURITY DEFINER`, `SET search_path = public`):
- Helper `order_is_bagged(p_status text, p_is_packed boolean) returns boolean` (immutable).
- Deduct (when NEW is bagged and `stock_deducted_at` is null): per `product_id` of `order_items` where `kind <> 'service'`, summed; skip products without a `roasted_stock` row; subtract clamped at 0; history row `order_packed` with the order id and the **actual** delta (`new − previous`, so 0 when already at 0); set `stock_deducted_at = now()`.
- Restore (when NEW is not bagged and `stock_deducted_at` is set): for each stock row, `net = Σ delta_kg` of this order's `order_packed` + `order_unpacked` history rows; where `net < 0`, add `−net` back with an `order_unpacked` row; clear `stock_deducted_at`.
- Delete: a **BEFORE DELETE** trigger does the same restore (history `order_id` is `ON DELETE SET NULL`, so AFTER DELETE would lose the link).
- Setting `stock_deducted_at` must not recurse (set it on `NEW` in a BEFORE UPDATE trigger and do the stock writes there, or guard with `pg_trigger_depth()`; implementer's choice).
- Switch-over at the end of the migration: `delivered` orders get `stock_deducted_at = updated_at` with no stock change; open bagged orders (packed or `ready_for_delivery`) are deducted once through the deduct logic with `RAISE NOTICE 'stock deducted at switch-over for order %', id`. Order: backfill delivered rows **before** creating the new trigger, then create the trigger, then touch the open bagged orders (e.g. `UPDATE orders SET stock_deducted_at = NULL WHERE …` with a no-op that fires the trigger, or call the deduct function directly).

- [ ] **Step 1: Write the SQL test** `supabase/tests/stock_at_bagging.test.sql`. It assumes the migration was just run in the same transaction. Start with `ALTER TABLE orders DISABLE TRIGGER "notify-new-order";` (no emails). Fixtures: two new products (one with a stock row of 10 kg via the existing product trigger + update, one whose stock row you delete), one service product, a profile-less order (`user_id null`, `status 'approved'`, `delivery_date current_date`), items: 4 kg coffee A, 3 kg coffee B (no stock row), 1 service line. Each assertion is a `DO $$ … IF … THEN RAISE EXCEPTION 'FAIL: <name> got %', v; END IF; END $$;` block, ending with `SELECT 'ALL STOCK TESTS PASSED';`. Cases:
  - `tick is_packed → A stock 10 → 6, one order_packed row delta −4, stock_deducted_at set, service untouched, B skipped`
  - `tick again / set status packaging→ready_for_delivery while packed → no second deduction (A still 6)`
  - `untick is_packed while status approved → A back to 10, order_unpacked +4, stock_deducted_at null`
  - `status → ready_for_delivery without is_packed → deducted once (A 6)`
  - `status → delivered after that → unchanged (A 6), no order_delivered row`
  - `clamp: set A to 1, new order 4 kg bagged → A 0 with delta −1; unbag → A 1 (not 4)`
  - `delete a bagged order → its kilos back (A +4), history kept with order_id null`
  - `add_roasted_stock(B, 30) as an admin → creates B row, 30 kg, change_type roasted` (impersonate with `SET LOCAL request.jwt.claims = '{"sub":"<an admin user id>","role":"authenticated"}'` and `SET LOCAL role authenticated`; pick an admin id from the table `public.has_role()` reads (e.g. `SELECT user_id FROM user_roles WHERE role='admin' LIMIT 1`; check the function body first) before switching role; `RESET role` after)
  - `add_roasted_stock with 0 → raises`; `set_green_percent(A, 51) → raises`; `set_green_percent(A, 17) → products.green_percent 17`; `set_green_percent(A, null) → null`; `set_default_green_percent(12) → row 12`
  - `switch-over: every delivered order has stock_deducted_at not null`
- [ ] **Step 2: Write the migration** to the Interfaces and behaviour above.
- [ ] **Step 3: Hand both files to the controller.** The controller runs, via the Supabase MCP `execute_sql` on project `wkffugaijomivqahnxom`, one query: `BEGIN;` + migration text + test text + `ROLLBACK;` and checks the last result is `ALL STOCK TESTS PASSED`, then confirms with `SELECT to_regclass('public.roasting_settings')` → null (nothing persisted). Fix and repeat until it passes.
- [ ] **Step 4: Check the product sync cannot overwrite `green_percent`:** `grep -rn "from(\"products\")\|from('products')" supabase/functions` and confirm every upsert/update lists explicit columns (no full-row spread from Sellsy/Shopify data). Note the result in the commit message.
- [ ] **Step 5: Commit** `feat(db): stock leaves at bagging, roasted stock RPC, loss percentages`.

### Task 2: Pure roasting arithmetic

**Files:**
- Create: `src/lib/roasting.ts`
- Test: `src/test/roasting.test.ts`

**Interfaces:**
- Produces:
```ts
export const DEFAULT_GREEN_PERCENT = 15;
export function isBagged(o: { status: string; is_packed: boolean }): boolean;
export function isOpenForRoasting(o: { status: string; is_packed: boolean }): boolean; // received|approved|packaging and !is_packed
export function greenKg(roastedKg: number, percent: number): number;               // round2
export function parseKgInput(raw: string): number | null;                           // "12,5"→12.5; "", "abc", ≤0 → null
export function parsePercentInput(raw: string): number | null;                      // "17"→17, "17,5"→17.5; <0, >50, "" → null
export type RoastingLine = { orderId: string; productId: string; productName: string; quantityKg: number; kind: "coffee" | "service"; deliveryDate: string };
export type RoastingInputs = { stockKg: Record<string, number>; productPercent: Record<string, number | null>; defaultPercent: number };
export type RoastingNeed = {
  productId: string; productName: string; neededKg: number; stockKg: number; toRoastKg: number;
  percent: number; percentIsCustom: boolean; greenKg: number; earliestDelivery: string; orderIds: string[];
};
export function computeRoastingNeeds(lines: RoastingLine[], inputs: RoastingInputs, opts?: { includeCovered?: boolean }): RoastingNeed[];
```
  `computeRoastingNeeds` ignores `kind: "service"`, sums kg per product (round2), stock missing → 0, returns only `toRoastKg > 0` unless `includeCovered`, sorted by `earliestDelivery` then `productName` (`localeCompare`, "fr").

- [ ] **Step 1: Write failing tests** (`describe("roasting")`):
  - `greenKg(30, 15) === 34.5`; `greenKg(15, 17) === 17.55`; `greenKg(0, 15) === 0`.
  - `computeRoastingNeeds` with lines Golden Huila 30 kg (stock absent), Brésil 50+35 kg (stock 70, percent 17), Brésil service line 1 kg, Cauca 5 kg (stock 7), default 15 → `[Golden Huila {neededKg 30, stockKg 0, toRoastKg 30, percent 15, percentIsCustom false, greenKg 34.5}, Brésil {85, 70, 15, 17, true, 17.55}]` ordered by earliest delivery; Cauca absent; with `{ includeCovered: true }` Cauca present with `toRoastKg 0, greenKg 0`.
  - floating sums: 0.25 + 0.15 + 0.1 kg → `neededKg 0.5` exactly.
  - `isBagged`: packed approved → true; `ready_for_delivery` unpacked → true; `delivered` → true; `packaging` unpacked → false. `isOpenForRoasting`: received/approved/packaging unpacked → true; packaging packed → false; ready → false.
  - `parseKgInput("12,5") === 12.5`, `("0") === null`, `("-3") === null`, `("") === null`, `(" 30 ") === 30`.
  - `parsePercentInput("17,5") === 17.5`, `("0") === 0`, `("50") === 50`, `("51") === null`, `("") === null`.
- [ ] **Step 2: Run** `npx vitest run src/test/roasting.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/roasting.ts` (round2 like `src/lib/pricing.ts`: `Math.round((x + Number.EPSILON) * 100) / 100`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: roasting arithmetic (kilos to roast, green weight)`.

### Task 3: Data layer — types, services, hooks

**Files:**
- Modify: `src/integrations/supabase/types.ts` (hand-edit: `orders.stock_deducted_at`, `products.green_percent`, `roasting_settings` table, the three RPCs in `Functions`)
- Modify: `src/services/stock.ts`, `src/hooks/useStock.ts`
- Create: `src/services/roasting.ts`, `src/hooks/useRoasting.ts`
- Test: `src/test/stock.test.ts` (update chain mocks), `src/test/roasting-service.test.ts`

**Interfaces:**
- Consumes: Task 1 SQL names; Task 2 `RoastingLine`, `RoastingInputs`.
- Produces:
```ts
// src/services/stock.ts
export type StockChangeType = "manual_update" | "order_delivered" | "order_packed" | "order_unpacked" | "roasted";
export const STOCK_CHANGE_LABEL: Record<StockChangeType, string>;
//   { manual_update: "Correction manuelle", order_delivered: "Livraison", order_packed: "Conditionné",
//     order_unpacked: "Remis en stock", roasted: "Torréfaction" }
// StockHistoryRow.change_type: StockChangeType
// getStockList(): only products with kind = 'coffee' (add .eq("kind", "coffee"))

// src/services/roasting.ts
export async function getRoastingInputs(): Promise<RoastingInputs & { productNames: Record<string, string> }>;
//   reads roasted_stock(product_id, quantity_kg), products(id, name, custom_name, data_source_mode, green_percent) — all products, active or not —
//   and roasting_settings.default_green_percent (fallback DEFAULT_GREEN_PERCENT when no row)
export async function getOpenRoastingLines(): Promise<RoastingLine[]>;
//   orders with status in (received, approved, packaging) and is_packed = false, with order_items(product_id, product_name, quantity, kind)
export async function addRoastedStock(productId: string, kg: number, note?: string): Promise<number>; // rpc add_roasted_stock
export async function setGreenPercent(productId: string, percent: number | null): Promise<void>;   // rpc set_green_percent
export async function setDefaultGreenPercent(percent: number): Promise<void>;                      // rpc set_default_green_percent

// src/hooks/useRoasting.ts  (query keys: ["roasting-inputs"], ["roasting-lines"])
export function useRoastingInputs(): UseQueryResult<RoastingInputs & { productNames: Record<string, string> }>;
export function useOpenRoastingLines(): UseQueryResult<RoastingLine[]>;
export function useAddRoastedStock(): UseMutationResult<number, Error, { productId: string; productName: string; kg: number }>;
//   onSuccess invalidates ["stock"], ["roasting-inputs"], ["roasting-lines"], ["stock-history"]; toast "Stock ajouté — {productName} +{kg.toFixed(2)} kg"
export function useSetGreenPercent(): UseMutationResult<void, Error, { productId: string; percent: number | null }>; // invalidates ["roasting-inputs"]
export function useSetDefaultGreenPercent(): UseMutationResult<void, Error, { percent: number }>;                    // invalidates ["roasting-inputs"]
```
  Product display name rule as in `getStockList` (custom name when `data_source_mode === "custom"`).

- [ ] **Step 1: Update `src/test/stock.test.ts`** mocks to the new chain `from().select().eq("is_active", true).eq("kind", "coffee").order()` and add a test that `getStockList` calls `.eq("kind", "coffee")`.
- [ ] **Step 2: Write `src/test/roasting-service.test.ts`**: `getOpenRoastingLines` maps rows to `RoastingLine` (quantity as number, kind kept, deliveryDate from order) and requests `.in("status", ["received","approved","packaging"])` and `.eq("is_packed", false)`; `getRoastingInputs` falls back to 15 when settings returns no row and keeps `green_percent: null` as null; `addRoastedStock` calls `rpc("add_roasted_stock", { p_product_id, p_kg, p_note: null })` and returns the number; errors from Supabase are thrown.
- [ ] **Step 3: Run** both test files → FAIL.
- [ ] **Step 4: Implement** services, hooks, types.ts edits.
- [ ] **Step 5: Run** both → PASS; run `npx tsc --noEmit -p tsconfig.app.json` → no new errors.
- [ ] **Step 6: Commit** `feat: roasting data layer and coffee-only stock list`.

### Task 4: Shared controls — "Torréfié" sheet and percent chip

**Files:**
- Create: `src/components/stock/RoastedSheet.tsx`, `src/components/stock/PercentChip.tsx`
- Test: `src/test/roasting-controls.test.tsx`

**Interfaces:**
- Consumes: `useAddRoastedStock`, `useSetGreenPercent`, `useSetDefaultGreenPercent` (Task 3); `parseKgInput`, `parsePercentInput` (Task 2).
- Produces:
```tsx
export function RoastedSheet(props: { need: RoastingNeed | null; onClose: () => void }): JSX.Element;
// shadcn Sheet side="bottom". Title "Torréfié · {productName}". Label "Kilos sortis du torréfacteur".
// Input prefilled need.toRoastKg.toFixed(2), inputMode="decimal". Line "Stock après" "{stock.toFixed(2)} → {(stock+kg).toFixed(2)} kg".
// Button "Ajouter au stock" (disabled while pending or input invalid). Invalid input message "Entrez un poids supérieur à 0".
// Footnote "Erreur ? Modifier le stock à la main dans l'onglet Stock torréfié."
export function PercentChip(props:
  | { scope: "default"; percent: number }
  | { scope: "product"; productId: string; productName: string; percent: number; isCustom: boolean }): JSX.Element;
// Chip button text: default → "Par défaut {p} % ✎"; product → "{p} %" (copper style when isCustom: border-brand-orange-700 text-brand-orange-700).
// aria-label: default → "Modifier le pourcentage par défaut"; product → "Modifier le pourcentage de {productName}".
// Opens a Popover with input (inputMode="decimal"), "Enregistrer", and for product scope a "Revenir au défaut" button (only when isCustom) that saves null.
// Invalid message "Entre 0 et 50 %".
```
  Percent display: integers without decimals (`17`), otherwise up to 2 decimals with a comma (`17,5`).

- [ ] **Step 1: Write failing tests** (mock `@/hooks/useRoasting`):
  - sheet prefilled with "30.00", "Stock après" shows "0.00 → 30.00 kg"; typing "28,5" updates to "0.00 → 28.50 kg" and clicking "Ajouter au stock" calls mutate with `{ productId, productName, kg: 28.5 }` once.
  - pending mutation → "Ajouter au stock" disabled (Review Focus 2).
  - "0" or "" → button disabled and "Entrez un poids supérieur à 0" shown; mutate not called (Review Focus 3).
  - default chip shows "Par défaut 15 % ✎"; saving "12" calls set-default with `{ percent: 12 }`; "51" shows "Entre 0 et 50 %" and doesn't call.
  - product chip custom 17 has copper class and "Revenir au défaut" calls `{ productId, percent: null }`; non-custom chip has no reset button.
- [ ] **Step 2: Run** `npx vitest run src/test/roasting-controls.test.tsx` → FAIL.
- [ ] **Step 3: Implement** both components (shadcn `Sheet`, `Popover`, `Input`, `Button`; touch targets ≥ 44 px: `min-h-[44px]`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: Torréfié sheet and loss percent chip`.

### Task 5: Stock screen with two tabs (layout A)

**Files:**
- Create: `src/components/stock/RoastingNeedsTab.tsx`, `src/components/stock/StockListTab.tsx`
- Modify: `src/components/StockView.tsx` (becomes the shell: title + tabs), history entry labels
- Test: `src/test/admin-mobile-cards.test.tsx` (Stock block), create `src/test/stock-tabs.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `export function StockView(): JSX.Element` (unchanged export; used by `AdminDashboard.tsx:2244` and `RoasterDashboard.tsx`).

Behaviour:
- Header `h2` "Stock". Tabs (shadcn `Tabs`), tab state in URL via `useUrlState("st", "roast")`: "À torréfier ({n})" value `roast` (default) where n = number of needs; "Stock torréfié" value `stock`.
- **RoastingNeedsTab:** line "Vert = torréfié + % de perte" + `<PercentChip scope="default">`. `ul aria-label="À torréfier"` with one `li` card per `computeRoastingNeeds(lines, inputs)`: `h3` product name; rows "Commandes à conditionner" `{neededKg} kg`, "En stock" `− {stockKg} kg`, "À torréfier" big `{toRoastKg} kg`, "Vert à peser" + product `PercentChip` + big green (`text-brand-green-600`) `{greenKg} kg`; full-width button "Torréfié ✓" (aria-label "Torréfié {productName}") opening `RoastedSheet`. Empty: "Rien à torréfier : le stock couvre toutes les commandes." Loading: "Calcul en cours…". Query error: "Impossible de calculer le torréfié : {message}". Same cards on all widths (max-w-2xl), no table.
- **StockListTab:** today's StockView body moved as is (search, Tous/Stock bas, `ul aria-label="Stock"` cards + `data-wide-table`, edit popover, history sheet). History badge uses `STOCK_CHANGE_LABEL[row.change_type]`; positive rows green as today.
- [ ] **Step 1: Update the Stock test in `admin-mobile-cards.test.tsx`:** mock `@/hooks/useRoasting` (empty lines), render `StockView`, click tab "Stock torréfié", then keep the existing assertions unchanged.
- [ ] **Step 2: Write `src/test/stock-tabs.test.tsx`:** with mocked lines/inputs from Task 2's Golden Huila/Brésil example: default tab shows "À torréfier (2)"; first card "Colombie – Golden Huila" shows "30.00 kg" and "34.50 kg"; Brésil card shows "17 %" and "17.55 kg"; clicking "Torréfié Colombie – Golden Huila" opens a dialog titled "Torréfié · Colombie – Golden Huila"; with no lines the empty text shows and the tab reads "À torréfier (0)"; a history row with `change_type: "roasted"` shows "Torréfaction" (open via "Historique de …" in the stock tab).
- [ ] **Step 3: Run** both files → FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** both → PASS, then `npm test` → all pass.
- [ ] **Step 6: Commit** `feat: Stock screen tabs — À torréfier and Stock torréfié`.

### Task 6: Torréfaction screen uses the same numbers

**Files:**
- Modify: `src/components/RoasterView.tsx`, `src/pages/RoasterDashboard.tsx`, `src/pages/AdminDashboard.tsx` (roasterOrders mapping ~line 1362, RoasterView props ~1888)
- Test: create `src/test/roaster-view.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–4 (`computeRoastingNeeds` with `{ includeCovered: true }`, `isOpenForRoasting`, `useRoastingInputs`, `RoastedSheet`, `PercentChip`).
- Produces: `RoasterOrderItem` gains `kind: "coffee" | "service"`; `RoasterOrder` gains `is_packed: boolean`. `onMarkRoasted(orderId, true)` keeps its current meaning in both dashboards (sets `is_roasted` and status `packaging`).

Behaviour:
- Orders considered: `isOpenForRoasting(order)` (adds `received`, drops packed) then the existing date filter.
- Lines → `computeRoastingNeeds(..., { includeCovered: true })`; product rows show `toRoastKg` big and "Vert {greenKg} kg" with the product `PercentChip`; when `toRoastKg > 0` a "Torréfié ✓" button (same aria-label pattern "Torréfié {name}") opens `RoastedSheet`; covered coffees show "Couvert par le stock".
- Stats cards: "À torréfier" Σ toRoastKg, "Vert à peser" Σ greenKg, "Cafés urgents" (existing rule). Remove the is_roasted-based "Torréfié"/"Restant" cards and the progress bar.
- Batch suggestion uses `toRoastKg`; translate "Suggest:" → "Suggestion :".
- Per order inside a product: `approved` → button "Passer en conditionnement" (calls `onMarkRoasted(id, true)`); `packaging` → badge "En conditionnement"; `received` → badge "À valider" (Review Focus 1). Bulk button "Tout passer en conditionnement" only over `approved` orders, confirm dialog copy: title "Tout passer en conditionnement ?", body "{n} commande(s) de {productName} passeront en conditionnement. Le stock ne change pas.", buttons "Annuler" / "Confirmer". Remaining English strings in this file translated ("order(s)" → "commande(s)", "All roasted" removed).
- Dashboards: select/map `is_packed` and `order_items.kind` (RoasterDashboard query adds `is_packed` and `kind`; AdminDashboard `roasterOrders` maps `is_packed: o.is_packed` and `kind: i.kind === "service" ? "service" : "coffee"`).
- [ ] **Step 1: Write failing tests** (mock `@/hooks/useRoasting`, stock Brésil 70 with 17 %, default 15): orders = approved Golden Huila 30 kg + service line, packaging packed Brésil 40 kg, received Brésil 85 kg, approved Cauca 5 kg (stock 7):
  - stats "À torréfier" "45.00 kg" (30 + 15) and "Vert à peser" "52.05 kg" (34.50 + 17.55).
  - Golden Huila row shows "30.00 kg" and a "Torréfié Colombie – Golden Huila" button; Cauca shows "Couvert par le stock" and no Torréfié button.
  - the packed Brésil 40 kg order is not counted (Brésil needed 85, not 125).
  - expanding Brésil: the received order shows "À valider" and no "Passer en conditionnement" button; expanding Golden Huila: clicking "Passer en conditionnement" calls `onMarkRoasted(orderId, true)`.
  - no text "kg" total includes the service line (Golden Huila needed exactly 30.00).
- [ ] **Step 2: Run** `npx vitest run src/test/roaster-view.test.tsx` → FAIL.
- [ ] **Step 3: Implement** RoasterView + both dashboards' mapping.
- [ ] **Step 4: Run** → PASS; `npm test` → all pass; `npx tsc --noEmit -p tsconfig.app.json` → clean.
- [ ] **Step 5: Commit** `feat: Torréfaction uses kilos after stock and green weight`.

### Task 7: Whole-branch verification (controller)

- [ ] **Step 1:** `npm test`, `npm run lint` (no new errors in touched files), `npm run build` → all succeed.
- [ ] **Step 2:** Re-run the Task 1 SQL test in `BEGIN … ROLLBACK` against the final migration file → "ALL STOCK TESTS PASSED"; confirm nothing persisted.
- [ ] **Step 3:** Start the local preview (`.claude/launch.json` config `pluralroaster-worktree`, port 5174) and check at 375 px width: Stock opens on "À torréfier", cards readable, "Stock torréfié" tab cards and history open; Torréfaction screen shows the new stats. (Against production data the new columns/RPCs don't exist until release, so the À torréfier tab will show its error state; verify layout with the tests, and verify live behaviour after release.)
- [ ] **Step 4:** Dispatch the final whole-branch code review, fix findings, then report to the owner. **Release (migration apply, push, Vercel deploy) only after the owner's explicit OK**, in the order: migration → frontend deploy.
