# Admin view of the client's order summary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a frozen copy of the summary each client sees when validating an order, and let admin compare it side by side with the current order.

**Architecture:** A new `orders.client_snapshot jsonb` column, written only by the order RPC (or by an admin insert) and frozen by a trigger. The client's checkout builds one snapshot object; the RPC arguments are derived from that same object. A pure diff module compares the snapshot with the stored order lines, and a dialog in the admin order Sheet renders both in layout B.

**Tech Stack:** React 18 + TypeScript + Vite, shadcn/ui, Tailwind, Vitest + Testing Library, Supabase Postgres (plpgsql, RLS).

**Spec:** `docs/superpowers/specs/2026-11-11-admin-client-receipt-design.md`

## Global Constraints

- Work in `~/dev/pr-price-breakdown`, branch `feat/client-receipt-snapshot`. Never in the iCloud checkout.
- No production DB change, push or deploy without the owner's explicit OK (Task 6 only).
- Money compared to the cent with `round2` from `src/lib/pricing.ts`; never compare raw floats.
- French UI copy exactly: "Comparer avec le récapitulatif client", "Vu par le client", "Créée par l'admin", "Actuelle (à facturer)", "Identique à la commande", "Modifiée après validation", "Récapitulatif client non disponible", "Copie incohérente avec la commande enregistrée", "Imprimer".
- Snapshot JSON = `OrderReceiptData` (from `src/lib/orderUtils.ts`) + `version: 1`, `source: "client" | "admin"`, optional `mismatch: true`.
- The legacy 8-arg `create_order_with_items` overload stays. `anon` has no EXECUTE on the new overload.
- Commands: `npx vitest run <file>`, `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep <touched files>`, `npm run build`.

## Review Focus

1. Bag orders (250 g × 4): snapshot counts bags, stored rows count kg → the diff must call them identical (Task 2 test `bag lines match stored kg rows`).
2. A phone running the old cached app calls the RPC without `p_client_snapshot` → order still placed, snapshot NULL (Task 1 verification query 4).
3. Packaging ticking "Conditionné" or admin changing status updates `orders` → the write-once trigger must not fire (Task 1 verification query 6).
4. Same product in two sizes (Cauca kg + Cauca 250 g) → two distinct lines, never merged (Task 2 test `same product two sizes stays two lines`).
5. Only the delivery changed (admin edit moved the order across the 10 kg band) → "Modifiée", delivery row highlighted (Task 2 test `delivery change alone is a difference`).

---

### Task 1: Migration — column, RPC v6, write-once trigger

**Files:**
- Create: `supabase/migrations/20261111000000_order_client_snapshot.sql`

**Interfaces:**
- Produces: `orders.client_snapshot jsonb NULL`; RPC `create_order_with_items(…13 current args…, p_client_snapshot jsonb DEFAULT NULL)` returning `{order_id}`; trigger `orders_client_snapshot_guard`.

- [ ] **Step 1: Write the migration** following `20261108000000_order_delivery_breakdown.sql` (no BEGIN/COMMIT, the MCP wraps it):
  - `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_snapshot jsonb;`
  - Drop the 13-arg overload, create the 14-arg one (body identical, plus): before the order INSERT, `PERFORM set_config('plural.snapshot_rpc', 'on', true);`; insert `client_snapshot` = NULL when `p_client_snapshot` is NULL, else `jsonb_set(p_client_snapshot, '{orderId}', to_jsonb(v_order_id::text))` with, when `abs((p_client_snapshot->>'totalHT')::numeric - p_total_price) > 0.01`, also `|| '{"mismatch": true}'`. Generate `v_order_id := gen_random_uuid()` first and insert it explicitly so the snapshot is written in the same INSERT.
  - Same REVOKE (PUBLIC, anon) / GRANT (authenticated, service_role) as the delivery migration, on the 14-arg signature.
  - Trigger function `public.orders_client_snapshot_guard()` (plpgsql, SECURITY DEFINER, search_path public), BEFORE INSERT OR UPDATE ON orders FOR EACH ROW:
    - INSERT: if `NEW.client_snapshot IS NOT NULL` and not `public.has_role(auth.uid(), 'admin')` and `current_setting('plural.snapshot_rpc', true) IS DISTINCT FROM 'on'` → `NEW.client_snapshot := NULL`.
    - UPDATE: if `NEW.client_snapshot IS DISTINCT FROM OLD.client_snapshot` → `RAISE EXCEPTION 'client_snapshot is write-once'`, for every role.
  - Verification queries as comments at the bottom (used in Task 6):
    1. 2 overloads of `create_order_with_items` (8-arg, 14-arg).
    2. column exists.
    3. `has_function_privilege('anon', '<14-arg sig>', 'EXECUTE')` = false.
    4. In `BEGIN; … ROLLBACK;` as the SAUL TEST user (`set local role authenticated; set local request.jwt.claims …`): call the RPC without `p_client_snapshot` → order row has NULL snapshot.
    5. Same, with a snapshot whose totalHT is off by 1 € → stored with `mismatch = true` and `orderId` = the new id.
    6. Same transaction: `update orders set is_packed = true` on that order succeeds; `update orders set client_snapshot = '{}'` raises `client_snapshot is write-once`.
    7. Direct `insert into orders (…, client_snapshot)` as the client → stored NULL.

- [ ] **Step 2: Commit** `feat(db): orders.client_snapshot, RPC v6, write-once guard`.

### Task 2: Snapshot and diff module

**Files:**
- Create: `src/lib/clientSnapshot.ts`
- Test: `src/test/client-snapshot.test.ts`

**Interfaces:**
- Consumes: `OrderReceiptData` (`src/lib/orderUtils.ts`), `OrderBreakdown`, `round2`, `storedOrderBreakdown`, `StoredOrderItem` (`src/lib/pricing.ts`), `CartItem` (`src/lib/store.ts`).
- Produces:
  - `type ClientSnapshot = OrderReceiptData & { version: 1; source: "client" | "admin"; mismatch?: boolean }`
  - `buildClientSnapshot(input: { items: CartItem[]; breakdown: OrderBreakdown; deliveryDate: string; notes: string | null; discountPercent: number; source: "client" | "admin"; orderId?: string }): ClientSnapshot` — same item mapping as `CheckoutPage` `receiptData` today; `orderId` defaults to `""` (the RPC fills it); `placedAt` = now ISO.
  - `parseClientSnapshot(raw: unknown): ClientSnapshot | null` — null unless `version === 1` and `breakdown` present.
  - `rpcTotalsFromBreakdown(b: OrderBreakdown): { p_total_price: number; p_delivery?: { full_price: number; discount_percent: number; net: number }; p_discount_percent?: number }` — `p_discount_percent` only when `b.coffee.discountPercent > 0`.
  - `type ReceiptLine = { key: string; label: string; sizeLabel: string | null; quantity: number; unit: "kg" | "bag"; grossHT: number }`
  - `snapshotLines(s: ClientSnapshot): ReceiptLine[]` and `storedLines(items: StoredOrderItem[]): ReceiptLine[]` (coffee rows only; bags = `round(quantity / size_kg)` when `size_kg < 1`; key = `${name}::${sizeKg ?? "kg"}`; `grossHT` via `round2`).
  - `type LineChange = { key: string; status: "same" | "changed" | "added" | "removed"; before?: ReceiptLine; after?: ReceiptLine }`
  - `diffReceipts(s: ClientSnapshot, currentItems: StoredOrderItem[], currentBreakdown: OrderBreakdown): { identical: boolean; lines: LineChange[]; deliveryChanged: boolean; htDelta: number }` — `identical` = every line `same` (quantity and grossHT equal to the cent), delivery net equal, totalHT/TTC equal; `htDelta = round2(current.totalHT − snapshot.breakdown.totalHT)`.

- [ ] **Step 1: Write the failing tests** in `src/test/client-snapshot.test.ts`:
  - `identical order is identical` — snapshot built from 20 kg Cauca @ 26.50, 10 % tier; stored rows the same → `identical: true`, `htDelta: 0`.
  - `bag lines match stored kg rows` — snapshot 4 × Brésil 250 g @ 9.50 (unitPrice); stored row quantity 1, price_per_kg 38, size_kg 0.25 → `identical: true`, line unit `bag`, quantity 4.
  - `quantity change is flagged` — stored Brésil 9 bags → status `changed`, `htDelta` = round2 of the new totalHT minus old.
  - `added and removed lines` — extra stored product → `added`; missing → `removed`.
  - `same product two sizes stays two lines` — Cauca kg + Cauca 250 g → two keys.
  - `delivery change alone is a difference` — same coffee lines, stored delivery row net 15 vs snapshot 12 → `identical: false`, `deliveryChanged: true`.
  - `cent rounding does not count as change` — stored price_per_kg 37.999999 for a 9.50 bag → `same`.
  - `parseClientSnapshot rejects junk` — null, `{}`, `{version: 2}` → null.
  - `rpcTotalsFromBreakdown` — no tier → no `p_discount_percent`; free delivery breakdown → `p_delivery.net` 0, `discount_percent` 100.
- [ ] **Step 2:** `npx vitest run src/test/client-snapshot.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/clientSnapshot.ts` with the signatures above.
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5: Commit** `feat: client snapshot builder and receipt diff`.

### Task 3: Client checkout saves the snapshot; draft button goes through checkout

**Files:**
- Modify: `src/pages/CheckoutPage.tsx` (props + `handleConfirm`)
- Modify: `src/pages/Index.tsx` (`handleConfirmOrder` ~406, `handlePlaceDraftOrder` ~472, `<CheckoutPage>` render ~637)
- Test: `src/test/checkout-snapshot.test.tsx`

**Interfaces:**
- Consumes: `buildClientSnapshot`, `rpcTotalsFromBreakdown` (Task 2).
- Produces: `CheckoutPageProps.onConfirm: (deliveryDate: string, notes: string | undefined, snapshot: ClientSnapshot) => Promise<{ orderId: string }>`; new optional prop `initialDeliveryDate?: string | null`.

- [ ] **Step 1: Write the failing test** `checkout passes the shown breakdown as snapshot`: render `CheckoutPage` with one 20 kg item, `discountPercent` 10, `initialDeliveryDate` set, `onConfirm` mock; click the confirm button → mock called once with a snapshot whose `breakdown.totalHT` equals the total displayed and `source` = `"client"`, and the date picker shows the initial date.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** In `CheckoutPage.handleConfirm`, build the snapshot with `buildClientSnapshot` from `snap` + `snapBreakdown` before calling `onConfirm(deliveryDate, notes, snapshot)`; after success, the localStorage receipt is `{ ...snapshot, orderId }`. Initialise `deliveryDate` state from `initialDeliveryDate`.
- [ ] **Step 4:** In `Index.handleConfirmOrder(deliveryDate, notes, snapshot)`: drop the local `computeOrderBreakdown`; spread `rpcTotalsFromBreakdown(snapshot.breakdown!)` into the RPC args; `p_pricing_tier_name` = `clientTier.name` only when `p_discount_percent` present; add `p_client_snapshot: snapshot`. `handlePlaceDraftOrder` no longer calls the RPC: it does `setView("checkout")`, and `<CheckoutPage>` gets `initialDeliveryDate={draftDeliveryDate}`.
- [ ] **Step 5:** Run the new test, `src/test/order-history-breakdown.test.tsx` and `src/test/price-breakdown.test.tsx` → PASS; tsc grep on the three files → no output.
- [ ] **Step 6: Commit** `feat(checkout): save the client's summary with the order; draft order goes through checkout`.

### Task 4: Admin manual orders save a copy

**Files:**
- Modify: `src/components/CreateOrderDialog.tsx` (save path, `orders` insert ~275)

**Interfaces:**
- Consumes: `buildClientSnapshot` (Task 2), the dialog's existing `breakdown` and `lineItems`.

- [ ] **Step 1:** Generate `const orderId = crypto.randomUUID()`; insert `id: orderId` and `client_snapshot: buildClientSnapshot({ …, source: "admin", orderId })`. Snapshot items come from `lineItems` (bag lines: `quantity` = bags, `unitPrice` = bag price, `sizeKg`, `sizeLabel`; kg lines: `quantity` = kg, `pricePerKg`). Add a small adapter `adminLinesToSnapshotItems(lines)` in `src/lib/adminOrderLines.ts` with a test in `src/test/admin-order-lines.test.ts`: `bag line maps to snapshot item` (4 × 250 g @ 9.50 → `{quantity: 4, unitPrice: 9.5, sizeKg: 0.25}`).
- [ ] **Step 2:** Run `npx vitest run src/test/admin-order-lines.test.ts` → PASS; tsc grep clean.
- [ ] **Step 3: Commit** `feat(admin): manual orders save a summary copy`.

### Task 5: Admin compare dialog

**Files:**
- Create: `src/components/ClientReceiptCompare.tsx`
- Modify: `src/pages/AdminDashboard.tsx` (`AdminOrder` type ~128, orders select ~457 + mapping, order Sheet ~2465)
- Test: `src/test/client-receipt-compare.test.tsx`

**Interfaces:**
- Consumes: `parseClientSnapshot`, `diffReceipts`, `snapshotLines`, `storedLines` (Task 2); `PriceBreakdown`; `storedOrderBreakdown`.
- Produces: `<ClientReceiptCompare open onOpenChange snapshotRaw={unknown} items={StoredOrderItem[]} discountPercent={number} createdAt={string} />`; `AdminOrder.client_snapshot: unknown`.

- [ ] **Step 1: Write the failing tests** (render the component):
  - `no snapshot` → text "Récapitulatif client non disponible" and one column ("Actuelle (à facturer)").
  - `identical` → one column titled "Vu par le client" and "Identique à la commande".
  - `edited` → both column titles, badge text contains "Modifiée après validation" and the signed HT delta formatted fr-FR (e.g. "+47,50 €"), the changed line has `data-change="changed"`.
  - `admin source` → column title "Créée par l'admin".
  - `mismatch` → "Copie incohérente avec la commande enregistrée" instead of the "Modifiée" badge.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: shadcn `Dialog`, `DialogContent` `max-w-4xl`; a `ReceiptColumn({ title, subtitle, lines, breakdown, changes })` used for both sides (item list with `data-change`, highlighted `bg-amber-50 dark:bg-amber-950/40` when not `same`, then `<PriceBreakdown>`); grid `md:grid-cols-2`, stacked below `md`; subtitle "validée le {d MMM yyyy HH:mm}" from `snapshot.placedAt`; "Imprimer" button → `window.print()`.
- [ ] **Step 4:** In `AdminDashboard`: add `client_snapshot` to the orders select and to `AdminOrder`; in the order Sheet under `<PriceBreakdown>`, a "Récapitulatif" block with the button "Comparer avec le récapitulatif client" opening `<ClientReceiptCompare>`. After an admin item edit (`recalcOrder`), the dialog reads the refreshed `selectedOrder.items`.
- [ ] **Step 5:** Run the test file → PASS; full `npx vitest run` → all pass; `npm run build` → success.
- [ ] **Step 6: Commit** `feat(admin): compare the client's summary with the current order`.

### Task 6: Ship (owner approval required at each production step)

- [ ] **Step 1:** Final whole-branch review (fresh reviewer).
- [ ] **Step 2:** Ask the owner; on OK, apply the Task 1 migration via MCP `apply_migration` to `wkffugaijomivqahnxom`, then run verification queries 1–7 (4–7 inside `BEGIN … ROLLBACK`). All must match.
- [ ] **Step 3:** Ask the owner; on OK, `git push origin HEAD:main`, deploy with the git-archive recipe (`vercel --prod --yes`), confirm `vercel inspect` Ready and the live admin chunk contains "Comparer avec le récapitulatif client".
- [ ] **Step 4:** Owner places a test order on SAUL TEST → admin dialog shows "Identique"; owner edits a quantity → both columns, badge. Delete the test order afterwards.
