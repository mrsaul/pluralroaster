# Order Price Breakdown & Loberz Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new order carries a weight-banded Loberz delivery line with Plural's 50 % contribution, shows the tier discount explicitly in a "layout B" breakdown everywhere, and totals equal the Sellsy invoice to the cent.

**Architecture:** One pure pricing module (`src/lib/pricing.ts`) computes an `OrderBreakdown` from coffee lines, the tier discount and a delivery input; every screen renders it through one `PriceBreakdown` component. Delivery is stored as an `order_items` row (`kind = 'service'`, Loberz product) holding its full price and discount, so past orders redisplay exactly. Order creation goes through a new version of the `create_order_with_items` RPC; the Sellsy invoice builder already turns service rows into invoice lines.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind/shadcn, Supabase (Postgres RPC, Edge Functions on Deno), Vitest + Testing Library, Sellsy API v2.

**Spec:** `docs/superpowers/specs/2026-11-08-order-price-breakdown-design.md`

## Global Constraints

- **Work outside iCloud.** The repo lives in `~/Documents` (iCloud); vitest/tsc/rsync stall there. Create a worktree: `git worktree add /tmp/pr-price-breakdown -b feat/price-breakdown origin/main`, then `cd /tmp/pr-price-breakdown && npm ci`. All commands below run there.
- Delivery full price HT by coffee kg: `kg <= 10` → **20**; `10 < kg <= 30` → **24**; `kg > 30` → **30**. No coffee (0 kg) → no delivery line.
- Plural contribution: **50 %** on every band, always. Free-delivery client: **100 %** (net €0).
- Tier discount (`pricing_tiers.product_discount_percent`, stored as `orders.discount_percent`) applies to **coffee only, never delivery**.
- Delivery TVA **20 %**; coffee TVA = product's Sellsy rate, fallback `DEFAULT_COFFEE_VAT_RATE` (5.5) from `src/lib/orderUtils.ts`.
- Every order pays its own delivery on its own weight (no grouping per client/day).
- Rounding mirrors the Sellsy invoice builder (`SELLSY_DISCOUNT_MODE = 'price'`): discounted unit = `round2(pricePerKg × (1 − d/100))`; line net = `round2(unit × kg)`; VAT per rate = `round2(Σ net at that rate × rate / 100)`.
- Exact French copy: block headings **"Café"**, **"Livraison à vélo"**, **"Total"**; rows **"{kg} kg · prix public"**, **"Votre remise −{d} %"**, **"Votre prix café"**, **"Loberz · {band}"**, **"Plural paie 50 %"**, **"Livraison offerte"**, **"Votre livraison"**, **"Total HT"**, **"TVA {rate} %"**, **"Total TTC"**. Band labels: **"jusqu'à 10 kg"**, **"11–30 kg"**, **"plus de 30 kg"**. Admin legacy flag: **"Livraison à ajouter dans Sellsy"**. Client toggle: **"Livraison gratuite"**.
- Sellsy: test invoices **only as drafts (brouillon)**; delete them afterwards. Never finalise.
- Past orders are never rewritten.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push or deploy until Task 8.

## Review Focus

1. **250 g bags** (`quantityKg = 0.25`, per-kg price from bag price) — line net must round per line, not on the total. Test in Task 1.
2. **Band edges** 10, 10.25, 30, 30.25 kg — must land in the right band. Test in Task 1.
3. **Admin removes every coffee line** from an order — delivery row removed, totals 0, no crash. Test in Task 6.
4. **Legacy order with no delivery row** in client history and admin — no delivery block, no crash; admin shows the Sellsy flag. Test in Tasks 5 and 6.
5. **Old cached app calling the RPC without `p_delivery`** — order still created (no delivery row), admin flag shows. Checked in Task 2.

---

### Task 1: Pricing module

**Files:**
- Create: `src/lib/pricing.ts`
- Test: `src/test/pricing.test.ts`

**Interfaces:**
- Consumes: `VatLine`, `DEFAULT_COFFEE_VAT_RATE` from `src/lib/orderUtils.ts`.
- Produces:
  ```ts
  export const DELIVERY_VAT_RATE = 20;
  export const PLURAL_DELIVERY_CONTRIBUTION_PERCENT = 50;
  export function round2(n: number): number; // decimal half-up: round2(27.075) === 27.08, round2(1.005) === 1.01
  export function deliveryFullPrice(coffeeKg: number): number | null; // null when coffeeKg <= 0
  export function deliveryBandLabel(coffeeKg: number): string;        // "jusqu'à 10 kg" | "11–30 kg" | "plus de 30 kg"
  export type PricedCoffeeLine = { pricePerKg: number; quantityKg: number; vatRate: number };
  export type DeliveryInput =
    | { kind: "auto"; free: boolean }
    | { kind: "stored"; fullPriceHT: number; discountPercent: number } // from an order_items service row
    | { kind: "none" };                                                  // legacy order
  export type DeliveryBreakdown = {
    bandLabel: string; fullPriceHT: number; discountPercent: number; // 50 or 100
    discountHT: number; netHT: number; free: boolean;
  };
  export type OrderBreakdown = {
    coffee: { kg: number; regularHT: number; discountPercent: number; discountHT: number; netHT: number };
    delivery: DeliveryBreakdown | null;
    totalHT: number; vatLines: VatLine[]; totalTTC: number;
  };
  export function computeOrderBreakdown(input: {
    coffeeLines: PricedCoffeeLine[]; discountPercent: number; delivery: DeliveryInput;
  }): OrderBreakdown;
  ```

- [ ] **Step 1: Write failing tests** in `src/test/pricing.test.ts`:
  - `round2(27.075) === 27.08`, `round2(1.005) === 1.01`, `round2(41.58) === 41.58` (naive `Math.round(n*100)/100` fails the first two).
  - `deliveryFullPrice`: `0 → null`, `1 → 20`, `10 → 20`, `10.25 → 24`, `30 → 24`, `30.25 → 30`, `120 → 30`.
  - ZAÏA example: `computeOrderBreakdown({ coffeeLines: [{ pricePerKg: 28, quantityKg: 30, vatRate: 5.5 }], discountPercent: 10, delivery: { kind: "auto", free: false } })` → `coffee: { kg: 30, regularHT: 840, discountPercent: 10, discountHT: 84, netHT: 756 }`, `delivery: { bandLabel: "11–30 kg", fullPriceHT: 24, discountPercent: 50, discountHT: 12, netHT: 12, free: false }`, `totalHT: 768`, `vatLines: [{ rate: 5.5, amount: 41.58 }, { rate: 20, amount: 2.4 }]`, `totalTTC: 811.98`.
  - No tier: `discountPercent: 0` → `coffee.discountHT === 0`, `coffee.netHT === coffee.regularHT`.
  - Free delivery, 9 kg at €30: `delivery.fullPriceHT 20, discountPercent 100, netHT 0, free true`; `vatLines` has no 20 % entry with amount > 0.
  - Rounding (Review Focus 1): line `{ pricePerKg: 28.5, quantityKg: 0.25, vatRate: 5.5 }` ×3 separate lines, discount 5 → each unit `round2(28.5×0.95)=27.08`, each line `round2(27.08×0.25)=6.77`, `coffee.netHT === 20.31`.
  - `{ kind: "stored", fullPriceHT: 25, discountPercent: 50 }` → `delivery.netHT 12.5`, band label derived from coffee kg.
  - `{ kind: "none" }` → `delivery === null`, totals exclude delivery.
  - No coffee lines with `kind: "auto"` → `delivery === null`, `totalHT === 0`.

- [ ] **Step 2: Run** `npx vitest run src/test/pricing.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/pricing.ts`** with the signatures above. Coffee: `regularHT = Σ round2(pricePerKg × kg)`; `netHT = Σ round2(round2(pricePerKg × (1 − d/100)) × kg)`; `discountHT = round2(regularHT − netHT)`. `round2` must round the decimal representation half-up (e.g. `Number(Math.round(Number(`${n}e2`)) + "e-2")`), not `Math.round(n*100)/100`. VAT: group net bases by rate (coffee lines at their rate, delivery at `DELIVERY_VAT_RATE`), drop zero bases, `amount = round2(base × rate / 100)`, sorted by rate — computed here, not with `computeVatLines` (it has the float rounding bug).

- [ ] **Step 4: Run** `npx vitest run src/test/pricing.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(pricing): order breakdown with Loberz delivery bands`.

---

### Task 2: Database — delivery columns, free-delivery flag, RPC v5

**Files:**
- Create: `supabase/migrations/20261108000000_order_delivery_breakdown.sql`
- Modify: `src/integrations/supabase/types.ts` (add the new columns and RPC arg by hand)

**Interfaces:**
- Produces (DB):
  - `order_items.list_price numeric NULL`, `order_items.line_discount_percent numeric NULL` (used only on the delivery row).
  - `companies.free_delivery boolean NOT NULL DEFAULT false`.
  - RPC `create_order_with_items(...same 12 args..., p_delivery jsonb DEFAULT NULL)`. `p_delivery` = `{ "full_price": number, "discount_percent": number, "net": number }`. When non-null the RPC inserts one `order_items` row: `kind 'service'`, `product_id` = id of `products` where `sku = '0001'`, `product_name 'Livraison à vélo Loberz'`, `product_sku '0001'`, `quantity 1`, `price_per_kg = net`, `list_price = full_price`, `line_discount_percent = discount_percent`.

- [ ] **Step 1: Write the migration.** `DROP FUNCTION` the 12-arg `create_order_with_items(uuid,date,numeric,numeric,text,timestamptz,text,jsonb,uuid,uuid,numeric,text)` and `CREATE` the 13-arg version, keeping every existing check (auth, ownership/admin, discount 0–100) and `SECURITY DEFINER`, `search_path public`. Raise if `p_delivery` is set but no `sku = '0001'` product exists. Also set the Loberz product `price_per_kg = 24`. `GRANT EXECUTE ... TO authenticated`.
- [ ] **Step 2: Apply** to project `wkffugaijomivqahnxom` with the Supabase connector's `apply_migration` (CLI has no access).
- [ ] **Step 3: Verify** with `execute_sql`:
  - `select pg_get_function_identity_arguments(oid) from pg_proc where proname='create_order_with_items'` → exactly two rows: the legacy 8-arg version and the new 13-arg one (12-arg gone). Review Focus 5: the old app's call (12 named args incl. `p_reordered_from`) can then only match the 13-arg version, since the 8-arg one lacks those names.
  - `select column_name from information_schema.columns where (table_name='order_items' and column_name in ('list_price','line_discount_percent')) or (table_name='companies' and column_name='free_delivery')` → 3 rows.
- [ ] **Step 4: Update `types.ts`** for the three columns and `p_delivery?: Json`.
- [ ] **Step 5: Commit** `feat(db): delivery line columns, free_delivery flag, order RPC v5`.

---

### Task 3: `PriceBreakdown` component

**Files:**
- Create: `src/components/PriceBreakdown.tsx`
- Modify: `src/i18n/index.tsx` (fr + en strings under a new `breakdown` key)
- Test: `src/test/price-breakdown.test.tsx`

**Interfaces:**
- Consumes: `OrderBreakdown` (Task 1); `formatVatRate` from `orderUtils`.
- Produces: `export function PriceBreakdown({ breakdown, className }: { breakdown: OrderBreakdown; className?: string }): JSX.Element` — layout B: three blocks with the exact copy in Global Constraints; discount rows green (`text-brand-green-600` as used elsewhere); amounts `€x.xx` tabular.

- [ ] **Step 1: Failing tests:** ZAÏA breakdown renders "Votre remise −10 %", "Plural paie 50 %", "Votre livraison", "€811.98"; no-tier breakdown renders no "Votre remise"; free delivery renders "Livraison offerte" and not "Plural paie 50 %"; `delivery: null` renders no "Livraison à vélo" heading.
- [ ] **Step 2: Run** `npx vitest run src/test/price-breakdown.test.tsx` — FAIL.
- [ ] **Step 3: Implement** the component and i18n keys.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ui): PriceBreakdown component (layout B)`.

---

### Task 4: Client checkout, confirmation, receipt and share

**Files:**
- Modify: `src/pages/Index.tsx` (`companies(...)` select ~L305 adds `free_delivery`; new state `freeDelivery: boolean`; `handleConfirmOrder` ~L460)
- Modify: `src/pages/CheckoutPage.tsx` (new prop `freeDelivery: boolean`; replace the HT/remise/TVA/TTC rows in review and success with `<PriceBreakdown>`; header subtitle TTC uses `breakdown.totalTTC`)
- Modify: `src/lib/orderUtils.ts` (`OrderReceiptData` gains `breakdown: OrderBreakdown`; `buildPlainTextSummary` adds remise, livraison and total lines)
- Modify: `src/pages/OrderReceiptPage.tsx` (render blocks from `data.breakdown`; if absent — receipts saved before this ship — keep the current rendering)
- Test: `src/test/pricing.test.ts` (add a `buildPlainTextSummary` case)

**Interfaces:**
- Consumes: `computeOrderBreakdown`, `PriceBreakdown`, RPC `p_delivery` (Task 2).
- Produces: `cartToCoffeeLines(items: CartItem[]): PricedCoffeeLine[]` in `src/lib/pricing.ts` (per-kg price = `unitPrice / sizeKg` when both set, else `product.pricePerKg`; kg = `sizeKg × quantity` or `quantity`; vatRate = `product.vatRate ?? DEFAULT_COFFEE_VAT_RATE`).

- [ ] **Step 1: Failing tests:** `cartToCoffeeLines` for a 250 g bag item and a per-kg item; `buildPlainTextSummary` with the ZAÏA breakdown contains "Remise −10 %", "Livraison à vélo : 12,00 €" and "Total TTC : 811,98 €".
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `handleConfirmOrder` computes the breakdown with `{ kind: "auto", free: freeDelivery }`, sends `p_total_price = breakdown.totalHT`, and `p_delivery = { full_price, discount_percent, net }` when `breakdown.delivery` is non-null. Remove the old `VAT`/`vatLinesFor` summary code in CheckoutPage once replaced.
- [ ] **Step 4: Run** the test suite (`npx vitest run`) — PASS; then `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "CheckoutPage|Index.tsx|orderUtils|OrderReceiptPage|pricing"` — no new errors.
- [ ] **Step 5: Manual check** with `npm run dev` in the worktree (port shown by Vite), signed in as a test client: checkout shows the three blocks for a 30 kg cart. If no test client login is available, say so and verify via the component tests only.
- [ ] **Step 6: Commit** `feat(checkout): show discount and Loberz delivery breakdown`.

---

### Task 5: Client order history

**Files:**
- Modify: `src/lib/store.ts` (`Order` gains `discountPercent: number`, `delivery: { fullPriceHT: number; discountPercent: number } | null`)
- Modify: `src/pages/Index.tsx` (orders select adds `discount_percent` and `order_items(kind, list_price, line_discount_percent)`; mapping excludes `kind = 'service'` from `items` and fills `delivery`)
- Modify: `src/components/OrderCard.tsx` (expanded card renders `<PriceBreakdown>` built with `{ kind: "stored", ... }` or `{ kind: "none" }`)
- Test: `src/test/order-history-breakdown.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 3.
- Produces: `orderToBreakdown(order: Order): OrderBreakdown` in `src/lib/pricing.ts`.

- [ ] **Step 1: Failing tests:** `orderToBreakdown` for an order with a stored delivery `{25, 50}` → `delivery.netHT 12.5`; legacy order (`delivery: null`) → `breakdown.delivery === null` (Review Focus 4); OrderCard expanded legacy order renders without "Livraison à vélo".
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(history): price breakdown on past orders`.

---

### Task 6: Admin — order detail, edit recalculation, free-delivery toggle, admin-created orders

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`
  - `AdminOrder` (~L116) gains `discount_percent: number`, `free_delivery: boolean`; `AdminOrderItem` gains `list_price`, `line_discount_percent`; the orders select adds them (+ `companies(free_delivery)`).
  - Order detail (both the mobile Sheet and desktop Dialog branches, before "Checklist"): `<PriceBreakdown>` from the order; when the order has no `kind = 'service'` row and has coffee, show the flag **"Livraison à ajouter dans Sellsy"**.
  - Item lists in the detail skip the service row (it is shown in the breakdown).
  - Replace `recalcOrderTotals` (~L668) with `recalcOrder(orderId)` that loads items + order discount + company `free_delivery`, computes the breakdown with `{ kind: "auto", free }`, upserts/deletes the Loberz service row accordingly, and writes `total_kg` (coffee kg) and `total_price = breakdown.totalHT`. Legacy orders (no service row) get one created on their first edit — they are no longer "past", the admin is changing them.
- Modify: `src/components/AdminClientDetail.tsx` — switch **"Livraison gratuite"** bound to `companies.free_delivery`.
- Modify: `src/components/CreateOrderDialog.tsx` — compute the breakdown for the selected client, insert the delivery row with the coffee items, `total_price = breakdown.totalHT`; remove the `delivery_discount_percent` display.
- Test: `src/test/admin-recalc.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `export function deliveryRowFor(breakdown: OrderBreakdown): { price_per_kg: number; list_price: number; line_discount_percent: number } | null` in `src/lib/pricing.ts` (shared by CreateOrderDialog and `recalcOrder`).

- [ ] **Step 1: Failing tests:** `deliveryRowFor` for the ZAÏA breakdown → `{ price_per_kg: 12, list_price: 24, line_discount_percent: 50 }`; for a breakdown with no coffee → `null` (Review Focus 3); 9 kg → 12 kg edit moves the row from `{10,20,50}` to `{12,24,50}`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, plus the tsc grep for the three files.
- [ ] **Step 5: Audit `total_price` readers:** `grep -rn "total_price\|totalPrice" src` — admin list, revenue section, packaging, exports. Each must read as "total HT incl. delivery"; relabel any that say "TTC". List what you checked in the commit message.
- [ ] **Step 6: Commit** `feat(admin): breakdown, recalculation on edit, Livraison gratuite`.

---

### Task 7: Sellsy invoice and the export sheet

**Files:**
- Modify: `supabase/functions/sellsy-sync/index.ts` (`handleCreateInvoice`, service branch ~L1694): description `"Livraison à vélo Loberz — participation Plural {d} %"` (or `"Livraison offerte"` when 100); `unit_amount = String(price_per_kg)` stays (net, price mode). Select `list_price, line_discount_percent` on `order_items`.
- Modify: `supabase/functions/export-invoicing-sheet/index.ts` — service rows already use 20 % via `itemVatRate`; confirm the delivery row shows its net price.

- [ ] **Step 1: Deploy** `sellsy-sync` with the Supabase connector (`deploy_edge_function`, `verify_jwt: false` as today). Smoke: unauthenticated POST returns 401.
- [ ] **Step 2: Prerequisite:** owner clicks **"run product sync"** (Admin → Products) so the Loberz service gets its Sellsy `tax_id`/20 %. Verify: `select sku, sellsy_tax_rate from products where sku in ('0001')` → 20.
- [ ] **Step 3: Draft-invoice check, with the owner.** For a test order with: 30 kg coffee + 10 % tier; 9 × 250 g bags + 5 % tier; a free-delivery client — create the Sellsy invoice from the admin (the app creates **drafts**). Compare Sellsy's Total HT, each TVA line and Total TTC with the app breakdown. Expected: identical to the cent. If Sellsy rounds differently, fix `computeOrderBreakdown` to match and add the failing case to `pricing.test.ts`. Also try `SELLSY_DISCOUNT_MODE = 'field'` once on a draft: if Sellsy accepts it, report to the owner (spec: optional).
- [ ] **Step 4: Clean up:** delete the test drafts in Sellsy and the test orders in the DB.
- [ ] **Step 5: Commit** `feat(invoice): Loberz delivery line labels; verified against Sellsy drafts`.

---

### Task 8: Ship

- [ ] **Step 1:** Full suite `npx vitest run` — PASS. `npm run build` — succeeds.
- [ ] **Step 2:** Ask the owner before pushing. Then merge `feat/price-breakdown` to `main` (PR or fast-forward per the owner) and push.
- [ ] **Step 3: Deploy the web app** from the worktree (not iCloud): copy `.vercel/project.json` and the owner's `.env` (has `VITE_VAPID_PUBLIC_KEY`) from the main checkout, then `vercel --prod --yes`. Pushing to GitHub does not deploy.
- [ ] **Step 4: Verify live:** fetch the deployed JS chunks and grep for "Plural paie 50" and "Livraison à ajouter dans Sellsy".
- [ ] **Step 5:** Tell the owner to stop adding the Loberz line by hand in Sellsy for orders placed from now on, and to keep adding it for flagged older orders.
- [ ] **Step 6:** `git worktree remove /tmp/pr-price-breakdown`.
