# Negotiated Pricing Rules per Tier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tier carries a kg rate, a bag rate and an optional volume step; every order is priced per line from those rules, identically in the app, Sellsy, exports and emails.

**Architecture:** One pricing rule (`src/lib/tierRules.ts` + `computeOrderBreakdown`) mirrored in `supabase/functions/_shared/order-vat.ts`. Each coffee `order_items` row stores the rate it was charged (`line_discount_percent`); each order stores the rule set used (`orders.pricing_rules`). Server-side consumers read the per-line rate (falling back to `orders.discount_percent` for old orders); the app recomputes from the stored rules.

**Tech Stack:** React 18 + TS + Vite, shadcn/ui, Tailwind, Vitest + Testing Library, Supabase Postgres (plpgsql), Deno edge functions.

**Spec:** `docs/superpowers/specs/2026-11-20-tier-rules-design.md`

## Global Constraints

- Work in `~/dev/pr-price-breakdown`, branch `feat/tier-rules`. Never the iCloud checkout.
- No production DB change, edge-function deploy, push or Vercel deploy without the owner's explicit OK (final Ship task, controller only).
- Money: `round2` from `src/lib/pricing.ts` (mirror in `_shared/order-vat.ts`); discounted unit = round2(price/kg × (1 − rate/100)) when rate > 0, else the raw price; line net = round2(unit × kg). Unchanged from today.
- A bag = a line with `sizeKg` / `size_kg` > 0 and < 1. Everything else (plain kg, 1 kg, 3 kg) is "coffee by the kg" and counts toward the volume step.
- Volume step: kg rate = `kgAbove` when `thresholdKg` set and kg-by-the-kg in the order ≥ `thresholdKg` (inclusive), else `kg`.
- Delivery is never discounted by the tier (unchanged Loberz rules).
- Copy (exact): tier summary `café au kg −5 % · dès 20 kg −10 % · sachets −5 %` (parts present only; capitalised first letter in Tarifs); client `Vos conditions : ` + summary; nudge `Plus que 1,5 kg pour passer à −10 %` / `Remise −10 % atteinte`; breakdown lines `Remise café au kg −10 %`, `Remise sachets −5 %`. Use U+2212 "−" and a space before "%" as written; numbers via `formatFrNumber`.
- Existing tiers must price exactly as today (backfill kg = bag = `product_discount_percent`, no step).
- Old orders (no `pricing_rules`, coffee rows with null `line_discount_percent`) price exactly as today from `orders.discount_percent`.
- Old client snapshots (breakdown without `coffee.discounts`) must still render.

## Review Focus

1. An existing client on "100 kilos" places an ordinary order → identical totals to before (Task 1 reference-order tests A, A', B, C).
2. A saved order is re-displayed after its tier is edited → still its original amounts (Task 7 test `past order ignores later tier change`).
3. An old snapshot / old order in history or the compare dialog renders its single discount line (Task 2 test `legacy breakdown without discounts`).
4. Reorder of an order with 250 g bags → cart gets bags back, priced and discounted as bags (Task 6 test `reorder keeps bags`).
5. Admin edit taking AMULETTE from 18 kg to 22 kg by the kg → kg lines move to 10 %, bag lines stay 5 %, rows' `line_discount_percent` rewritten (Task 7 test `admin edit crosses the step`).

---

### Task 1: Pricing core

**Files:**
- Create: `src/lib/tierRules.ts`
- Modify: `src/lib/pricing.ts`, `supabase/functions/_shared/order-vat.ts`
- Test: `src/test/tier-rules.test.ts`, extend `src/test/order-vat-shared.test.ts`

**Interfaces — Produces:**
- `type TierRules = { kg: number; bag: number; thresholdKg: number | null; kgAbove: number | null }`
- `flatRules(percent: number): TierRules` (kg = bag = percent, no step)
- `tierRulesFromRow(row: { kg_discount_percent?: number|string|null; bag_discount_percent?: number|string|null; volume_threshold_kg?: number|string|null; volume_kg_discount_percent?: number|string|null; product_discount_percent?: number|string|null } | null): TierRules` — null row → `flatRules(0)`; missing new columns → flat from `product_discount_percent`.
- `parseTierRules(raw: unknown): TierRules | null` (for `orders.pricing_rules` JSON; null when malformed)
- `isBagSize(sizeKg: number | null | undefined): boolean`
- `ratesFor(rules: TierRules, kgByTheKg: number): { kg: number; bag: number }`
- `describeRules(rules: TierRules): string | null` — null when every rate is 0.
- `volumeNudge(rules: TierRules, kgByTheKg: number): { kind: "remaining"; kg: number; percent: number } | { kind: "reached"; percent: number } | null` — null when no step, or when kgByTheKg = 0.
- `formatNudge(n: NonNullable<ReturnType<typeof volumeNudge>>): string`
- `PricedCoffeeLine` gains `isBag?: boolean`.
- `computeOrderBreakdown(input)`: input accepts `rules?: TierRules` in addition to the existing `discountPercent?: number` (rules win; neither → 0). Output `coffee` gains `discounts: { kind: "kg" | "bag"; percent: number; discountHT: number }[]` (rates > 0 applied to ≥ 1 line, kg first) and `lineRates: number[]` (rate per input coffee line, input order). `coffee.discountPercent` stays = the kg rate applied (0 if no kg lines → bag rate).
- `cartToCoffeeLines` sets `isBag` from `sizeKg`; `StoredOrderItem` gains `size_kg?: number | null`; `storedCoffeeLines` sets `isBag`.
- `storedOrderBreakdown(items, discountOrRules: number | TierRules)`, `recalcOrderFromItems({ items, rules?: TierRules, discountPercent?: number, free })` returning also `lineRates`.
- order-vat.ts: `VatItem` gains `line_discount_percent?: number | null`; coffee `lineUnitNet` uses it when non-null, else the order discount.

- [ ] **Step 1: Failing tests** in `src/test/tier-rules.test.ts`:
  - `AMULETTE below the step`: rules {kg 5, bag 5, 20, 10}; 19.75 kg Cauca by the kg (26.50) + 4 × Brésil 250 g (38/kg) → `lineRates` [5, 5], `discounts` [{kg,5,…},{bag,5,…}].
  - `AMULETTE at the step is inclusive`: 20 kg → kg lines 10, bag 5.
  - `bags never count toward the step`: 16 kg + 20 × 250 g (5 kg of bags) → kg rate 5.
  - `1 kg and 3 kg packs count as by the kg`: isBagSize(1)=false, isBagSize(3)=false, isBagSize(0.25)=true, isBagSize(null)=false.
  - `flat tiers equal today` — reference orders with `rules: flatRules(p)` equal `discountPercent: p`, and equal the Sellsy-verified totals: A' (5 %, 30 kg Cauca + 3 kg Brésil by the kg, delivery auto 50 %) HT 850.20 TTC 899.14; A (5 %, 30 kg Cauca) HT 767.40 TTC 811.35; B (15 %, 1 × Brésil 250 g + 10 kg Cauca) HT 245.38 TTC 260.62; C (5 %, free delivery, 5 kg Cauca) HT 125.90 TTC 132.82. Read unit prices from `src/test/pricing.test.ts` / `admin-order-lines.test.ts`; if A'/A/C don't reproduce with today's code, adjust line inputs (not totals) until today's `discountPercent` path reproduces them, then assert the rules path equals it.
  - `describeRules`: AMULETTE → `café au kg −5 % · dès 20 kg −10 % · sachets −5 %`; flat 10 → `café au kg −10 % · sachets −10 %`; flat 0 → null.
  - `volumeNudge`: AMULETTE at 18.5 kg → remaining 1.5 kg → `Plus que 1,5 kg pour passer à −10 %`; at 20 kg → `Remise −10 % atteinte`; flat tier → null; 0 kg → null.
  - `tierRulesFromRow` legacy row {product_discount_percent: 10} → flat 10; `parseTierRules("x")` → null.
  - In `order-vat-shared.test.ts`: a coffee VatItem with `line_discount_percent: 10` under order discount 5 is priced at 10; null falls back to 5; the app and edge give identical totals for a mixed-rate order.
- [ ] **Step 2:** `npx vitest run src/test/tier-rules.test.ts src/test/order-vat-shared.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement the interfaces above.
- [ ] **Step 4:** Same command → PASS; full `npx vitest run` → all pass (existing callers untouched).
- [ ] **Step 5: Commit** `feat(pricing): tier rules with kg/bag rates and volume step`.

### Task 2: Breakdown display with several discount lines

**Files:** Modify `src/components/PriceBreakdown.tsx`, `src/pages/OrderReceiptPage.tsx`, `src/lib/orderUtils.ts` (`buildPlainTextSummary`), i18n `breakdown` keys (`src/i18n`). Test: `src/test/price-breakdown.test.tsx`.

**Interfaces — Consumes:** `OrderBreakdown.coffee.discounts` (Task 1). **Produces:** `breakdownDiscounts(b: OrderBreakdown): { kind: "kg" | "bag"; percent: number; discountHT: number }[]` in `pricing.ts` — returns `b.coffee.discounts` when present, else `[{ kind: "kg", percent: discountPercent, discountHT }]` when discountPercent > 0, else [].

- [ ] **Step 1: Failing tests:** a mixed breakdown shows `Remise café au kg −10 %` and `Remise sachets −5 %`, each with its amount; `legacy breakdown without discounts` (an object with no `coffee.discounts`, discountPercent 10, as stored in old snapshots) shows exactly one line, labelled `Remise café au kg −10 %`, with the old discountHT; the plain-text summary lists both lines of the mixed case. Update existing assertions that pinned the old single-line label to the new label.
- [ ] **Step 2:** run `npx vitest run src/test/price-breakdown.test.tsx` → FAIL.
- [ ] **Step 3:** Render one row per `breakdownDiscounts(b)` entry in PriceBreakdown, OrderReceiptPage `BreakdownRows`, and the text summary.
- [ ] **Step 4:** PASS; full suite green.
- [ ] **Step 5: Commit** `feat(breakdown): one discount line per rate`.

### Task 3: Database, RPC v7 and server-side pricing

**Files:** Create `supabase/migrations/20261120000000_tier_rules.sql`. Modify `supabase/functions/sellsy-sync/index.ts`, `export-invoicing-sheet/index.ts`, `notify-new-order/index.ts`. Test: `src/test/order-vat-shared.test.ts` (already covers per-line rule), plus a sellsy unit pick test if the per-line rate is extracted into a pure helper.

**Interfaces — Produces:** columns `pricing_tiers.kg_discount_percent`, `bag_discount_percent` (numeric not null, backfilled from `product_discount_percent`, default 0), `volume_threshold_kg`, `volume_kg_discount_percent` (nullable, check both-or-neither, threshold > 0, percents 0–100); `orders.pricing_rules jsonb null`; RPC `create_order_with_items(... v6 args ..., p_pricing_rules jsonb DEFAULT NULL)` storing `pricing_rules` and each item's `(v_item->>'line_discount_percent')::numeric` (null when absent).

- [ ] **Step 1:** Write the migration following `20261111000000_order_client_snapshot.sql`: drop the 14-arg overload, create the 15-arg one with an identical body plus the two writes; keep the legacy 8-arg; same REVOKE/GRANT pattern; trigger untouched. Verification queries as comments (both overloads; columns; backfill equals product_discount_percent for all tiers; anon EXECUTE false; a BEGIN…ROLLBACK RPC call with per-line rates and pricing_rules stores them).
- [ ] **Step 2:** sellsy-sync: per coffee row, `pct = row.line_discount_percent ?? orderDiscountPct` (service rows unchanged) for `discountedUnit` and the log; select already includes `line_discount_percent`. export-invoicing-sheet and notify-new-order: add `line_discount_percent` to their `order_items` selects and to `toVatItem`.
- [ ] **Step 3:** `npx vitest run src/test/order-vat-shared.test.ts` PASS; `deno check` if available, else the repo's existing edge typecheck command; no deploy.
- [ ] **Step 4: Commit** `feat(db): tier rule columns, order pricing_rules, RPC v7; per-line rates in Sellsy/export/email`.

### Task 4: Tarifs editor and tier summaries

**Files:** Modify `src/components/PricingTiersView.tsx`, `src/components/AdminClientDetail.tsx` (tier chips + selected-tier summary). Test: `src/test/admin-mobile-cards.test.tsx` (extend) or new `src/test/pricing-tiers-view.test.tsx`.

**Interfaces — Consumes:** `TierRules`, `tierRulesFromRow`, `describeRules` (Task 1).

- [ ] **Step 1: Failing tests:** the create/edit form has fields `Remise café au kg (%)`, `Remise sachets (%)`, `À partir de (kg)` and `Remise au kg au-delà (%)`; saving AMULETTE values writes `kg_discount_percent 5, bag_discount_percent 5, volume_threshold_kg 20, volume_kg_discount_percent 10` and keeps `product_discount_percent` = kg rate; threshold without its rate (or vice versa) shows an inline error and doesn't save; cards and table show `Café au kg −5 % · dès 20 kg −10 % · sachets −5 %`; no "remise livraison" field or badge anywhere (Tarifs and client window).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (select `*` already returns the new columns). **Step 4:** PASS + full suite.
- [ ] **Step 5: Commit** `feat(tarifs): kg/bag rates and volume step per tier`.

### Task 5: Client checkout uses the tier rules

**Files:** Modify `src/pages/Index.tsx` (tier load, `handleConfirmOrder`), `src/pages/CheckoutPage.tsx`, `src/lib/clientSnapshot.ts` (`rpcTotalsFromBreakdown`), `src/components/CartBar.tsx`, `src/pages/CatalogPage.tsx`. Test: `src/test/checkout-snapshot.test.tsx` (extend), new `src/test/client-terms.test.tsx`.

**Interfaces — Consumes:** Task 1. **Produces:** `clientTier` state becomes `{ name: string; rules: TierRules } | null` (null only when no tier or `describeRules` is null); `CheckoutPage` prop `rules: TierRules` replaces `discountPercent`; `CartBar` props `terms?: string | null`, `nudge?: string | null`; RPC args add `p_pricing_rules` and per-item `line_discount_percent` (from `breakdown.coffee.lineRates`, same order as `cart.items`); `p_discount_percent` = `breakdown.coffee.discountPercent` when > 0.

- [ ] **Step 1: Failing tests:** checkout with AMULETTE rules and 22 kg + 4 × 250 g shows `Vos conditions : café au kg −5 % · dès 20 kg −10 % · sachets −5 %`, `Remise −10 % atteinte`, and both discount lines; the snapshot passed to `onConfirm` has `breakdown.coffee.lineRates` [10, 5]; with 18.5 kg the nudge reads `Plus que 1,5 kg pour passer à −10 %`; client without tier shows neither terms nor nudge; CartBar renders `terms`/`nudge` when given and nothing extra when not.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; Index selects `pricing_tiers(name, product_discount_percent, kg_discount_percent, bag_discount_percent, volume_threshold_kg, volume_kg_discount_percent)`. **Step 4:** PASS + full suite.
- [ ] **Step 5: Commit** `feat(checkout): tier rules, client terms and volume nudge`.

### Task 6: Reorder keeps bags as bags

**Files:** Modify `src/lib/persistedOrder.ts`, the orders select in `src/pages/Index.tsx` (`order_items(... size_label, size_kg, product_variant_id ...)`), `src/lib/store.ts` `Order` (`pricingRules: TierRules | null`). Test: new `src/test/persisted-order.test.ts`.

- [ ] **Step 1: Failing tests:** `reorder keeps bags`: a stored row `{quantity 1, price_per_kg 38, size_label "250g", size_kg 0.25}` maps to an item `{quantity: 4 (= round(1 kg / 0.25)), sizeLabel: "250g", sizeKg: 0.25, unitPrice: 9.5}` and its `coffeeLines` entry has `isBag: true`; a kg row maps unchanged; `pricing_rules` JSON maps to `pricingRules` (malformed → null); `orderToBreakdown` uses `pricingRules` when present, else `discountPercent`.
- [ ] **Step 2:** FAIL. **Step 3:** implement (`unitPrice = round2(price_per_kg × size_kg)` from the stored row; reorder then reprices from the catalogue as today for kg lines — keep existing behaviour of `items` using catalogue price/kg, and for bags use the catalogue variant price when the cart re-adds via `confirmReorder`, falling back to the stored bag price). **Step 4:** PASS + suite.
- [ ] **Step 5: Commit** `fix(reorder): bag lines come back as bags`.

### Task 7: Admin manual orders and edits

**Files:** Modify `src/components/CreateOrderDialog.tsx`, `src/pages/AdminDashboard.tsx` (`recalcOrder`, compare dialog prop), `src/components/ClientReceiptCompare.tsx` (accept `rules`). Test: `src/test/admin-recalc.test.ts` (extend), `src/test/admin-order-lines.test.ts`.

**Interfaces — Consumes:** Tasks 1, 3.

- [ ] **Step 1: Failing tests:** `admin edit crosses the step`: `recalcOrderFromItems({ items: 18 kg kg-lines + 4 bags, rules: AMULETTE })` → lineRates kg 5; after changing to 22 kg → kg 10, bags 5; `past order ignores later tier change`: an order whose `pricing_rules` = flat 10 is recomputed at 10 even if the tier now says 15 (the recalc reads `orders.pricing_rules`, falling back to `flatRules(orders.discount_percent)`); CreateOrderDialog builds rows with `line_discount_percent` per coffee row and the order insert carries `pricing_rules` and `discount_percent` = kg rate.
- [ ] **Step 2:** FAIL. **Step 3:** implement; `recalcOrder` also updates each coffee row's `line_discount_percent` (one update per changed row) and `orders.discount_percent`; dialog loads the tier's new columns. **Step 4:** PASS + suite + `npm run build`.
- [ ] **Step 5: Commit** `feat(admin): manual orders and edits priced by tier rules`.

### Task 8: Ship (controller only, owner approval at each production step)

- [ ] Final whole-branch review; fix wave.
- [ ] Owner OK → apply the migration, run its verification queries (each in its own BEGIN…ROLLBACK), confirm the three live tiers backfilled 5/5, 10/10, 15/15.
- [ ] Owner OK → deploy edge functions `sellsy-sync`, `export-invoicing-sheet`, `notify-new-order` (files `<fn>/index.ts` + `_shared/order-vat.ts`, verify_jwt false), push main, Vercel deploy.
- [ ] Owner creates the AMULETTE tier in Tarifs and assigns it; Sellsy draft check on TEST POPULAIRE (22 kg + 4 bags): app total = Sellsy draft total; delete test orders/drafts.
