# Stock: bagging takes stock out, and how much green coffee to roast

Date: 2026-11-24 · Status: for owner approval (builder check done)

## Why

The owner roasts to fill orders. Two numbers matter at the roaster:

1. **Roasted kilos still needed** per coffee: what open orders need, minus the
   loose roasted coffee already on the shelf.
2. **Green kilos to weigh** per coffee: roasting loses weight, so the owner loads
   more green than the roasted weight wanted. The rule of thumb is **+15 %**
   (green = roasted × 1.15), and it differs by coffee.

Today the app gives neither. Worse, its stock figure is misleading: stock only
goes down when an order is marked **Livrée**, while physically the coffee leaves
the bulk shelf when it is **bagged** (Conditionné). Orders that were bagged but
never marked delivered kept "holding" their kilos in stock (5 such orders,
133 kg, found and cleaned up on 2026-11-24).

The Stock screen is also hard to use on a phone, where the owner works at the
roaster. It should get the client-style cards the Clients list already has.

## Goals

- Stock goes down when an order is bagged, not when it is delivered.
- A per-coffee "À torréfier" list: roasted kilos needed and green kilos to weigh.
- A default loss percentage (15 %) plus an optional percentage per coffee.
- A one-tap "Torréfié" action that adds what came out of the roaster to stock.
- The Stock screen works well on a phone (layout A, see below).
- Manual stock correction (Modifier) stays available for mistakes.

## Non-goals

- No green-coffee inventory (sacks of green on hand). Only "how much to weigh".
- No new roast scheduling or roast profiles. The Torréfaction screen keeps
  its date filters and batch suggestions; only its totals and buttons change
  (section 8).
- No change to pricing, invoicing, Sellsy or the client ordering flow.

## Anti-goals (would be a failure even if it "works")

- Kilos subtracted twice for the same order, or never subtracted.
- A stock figure that no longer matches the shelves after the switch-over.
- Delivery services (Loberz) counted as coffee kilos anywhere.
- Any change to stock numbers at release time. The owner confirmed on
  2026-11-24 that today's stock numbers match the shelves.

## Decisions taken with the owner

| Topic | Decision |
|---|---|
| Subtract stock from what must be roasted | Yes. To roast = open-order coffee not yet bagged − roasted stock, never below 0. |
| When stock goes down | When the order is bagged ("Conditionné"). Unbagging puts it back. Livrée subtracts only if the order was never counted as bagged. |
| Green formula | green = roasted × (1 + % / 100). Default 15 %. |
| Percentage | Default 15 % for all, each coffee can have its own (option B). |
| After roasting | A "Torréfié" button per coffee, pre-filled with the kilos to roast, editable to what actually came out, adds that to stock. Manual Modifier stays for errors. |
| Phone layout | **A: two tabs.** "À torréfier" opens first; "Stock torréfié" has client-style cards. |
| How it's built | **Approach 1** (below). |
| Switch-over | Stock matched the shelves on 2026-11-24. Orders already delivered are marked as deducted without touching stock. Open orders bagged after that date are deducted once at release (none at the time of writing). |
| Old Torréfaction screen | **A: one place to roast.** Its totals use the same calculation as À torréfier, each coffee gets the same "Torréfié" button, and the per-order "Marquer torréfié" becomes "Passer en conditionnement". Reason given by the owner: the person with the Roaster role is the one who updates the stock. |

## Approaches considered

1. **The database moves the stock, the screen does the arithmetic** (chosen).
   A trigger on `orders` subtracts or restores stock when an order's bagged
   state changes, and records exactly what it subtracted. The À torréfier list
   is computed in the frontend from open orders and stock. Chosen because it
   behaves the same from every screen that changes an order (Commandes, order
   window, Conditionnement screen, roaster dashboard), is safe against double
   taps and concurrent users, and matches how delivery deduction already works.
2. **Each screen updates stock itself.** Rejected: at least three places tick
   the box; a dropped connection or double tap could subtract twice or never.
3. **Everything in the database, including the to-roast list as a view/RPC.**
   Rejected for now: harder to test and change for no visible gain at this
   volume (a handful of open orders at a time).

## Design

### 1. What "bagged" means

An order counts as **bagged (out of stock)** when any of these is true:

- `is_packed = true` (the "Conditionné" checkbox in Commandes / order window), or
- `status` is `ready_for_delivery` or `delivered`.

The second condition matters: the Conditionnement screen's main button
"Marquer comme prêt pour livraison" sets `status = ready_for_delivery` but
never sets `is_packed` (it uses per-line ticks kept in sessionStorage). The
owner calls that step "Conditionné" too. Four of the five stale orders were
in exactly that state.

An order is **not bagged** otherwise (`received`, `approved`, `packaging`
with the box unticked).

Production only holds the statuses `received`, `approved`, `packaging`,
`ready_for_delivery`, `delivered` (checked 2026-11-24: 226 delivered,
1 approved, 1 packaging; no legacy values such as `synced` or `confirmed`).
The SQL can match these five raw values; any other value counts as not bagged.

### 2. Stock movements (database)

New column `orders.stock_deducted_at timestamptz null`: set when the order's
coffee was taken out of stock, cleared when it was put back.

New/updated trigger on `orders` (AFTER UPDATE; replaces
`trg_decrease_stock_on_delivery` / `decrease_stock_on_delivery()`), plus an
AFTER DELETE trigger:

- **Becomes bagged and `stock_deducted_at` is null** → for each coffee product
  in the order (`order_items.kind = 'coffee'`, summed by `product_id`):
  subtract from `roasted_stock` (clamped at 0, as today), write a
  `roasted_stock_history` row with `change_type = 'order_packed'`, the order
  id, and the **actual** delta applied (after clamping). Set
  `stock_deducted_at = now()`.
- **Becomes not bagged and `stock_deducted_at` is set** (box unticked, or
  status moved back before `ready_for_delivery`) → add back exactly what this
  order's not-yet-reversed `order_packed` rows subtracted, write
  `change_type = 'order_unpacked'` rows, clear `stock_deducted_at`.
  Restoring the recorded deltas (not the order quantities) keeps the clamp
  from inflating stock.
- **Order deleted while `stock_deducted_at` is set** → same restore as above.
  (Owner's call to confirm; see "Calls I made".)
- Service lines (`kind = 'service'`) are never touched. Products without a
  `roasted_stock` row are skipped, as today.
- Setting `stock_deducted_at` must not re-fire the logic recursively (use a
  BEFORE trigger to set the column on NEW, or guard with
  `pg_trigger_depth()`; builder's choice).

Because `delivered` is itself "bagged", an order marked Livrée without ever
having been counted as bagged is deducted at that moment by the same rule,
and an order already deducted is not touched again. One code path covers both.

`roasted_stock_history.change_type` check constraint gains
`'order_packed'`, `'order_unpacked'`, `'roasted'`. Existing
`'order_delivered'` rows stay for history.

### 3. Switch-over (migration)

At release:

- Every `delivered` order: set `stock_deducted_at` to its `updated_at`
  **without touching stock** (the old trigger already subtracted it).
- Every open order that is bagged (packed or `ready_for_delivery`) but not
  delivered: under the old rule it has **not** been subtracted yet, while its
  coffee is physically off the shelf. Deduct it once through the new logic
  (history `order_packed`), so stock keeps matching the shelves. The
  migration should `RAISE NOTICE` each order it deducts, for the release notes.
  At the time of writing there are none.
- Open orders that are not bagged keep `stock_deducted_at` null and will
  deduct normally when bagged.

The owner confirmed on 2026-11-24 that stock matched the shelves after the
double-deduction correction made that day.

At the time of writing there are 2 open orders: `1ca77fec` (packaging, not
packed, Brésil 3 kg) and the Saul Test order `01970214` (approved, currently
no coffee lines, pending cleanup).

### 4. "Torréfié" (add roasted kilos)

New RPC `add_roasted_stock(p_product_id uuid, p_kg numeric, p_note text)`:
admin or roaster only (same check as `update_stock_with_history`), `p_kg > 0`,
creates the `roasted_stock` row if missing, adds `p_kg`, writes a history row
`change_type = 'roasted'`, delta `+p_kg`, recorded actor. Shown in Historique
as "Torréfaction +30.00 kg".

### 5. Loss percentage

- New single-row settings table `roasting_settings(id boolean primary key
  default true check (id), default_green_percent numeric not null default 15
  check (between 0 and 50), updated_at, updated_by)`, seeded with 15.
- New column `products.green_percent numeric null check (between 0 and 50)`:
  null means "use the default".
- RLS: `roasting_settings` readable and writable by admin and roaster.
  `products.green_percent` follows the existing products policies for reads
  (all signed-in users can read products, as they can already read
  `roasted_stock`; the percentage isn't sensitive). Writes by admin and
  roaster; the roaster role may need a narrow RPC
  (`set_green_percent(product_id, pct)`) if it can't update products today.
- Product sync from Sellsy/Shopify must not overwrite `green_percent`.

### 6. The À torréfier list (frontend)

Per coffee product, from all orders that are **not delivered and not bagged**
(statuses `received`, `approved`, `packaging` with `stock_deducted_at` null),
coffee lines only:

```
needed_kg   = Σ order_items.quantity        (kg; bag lines already store kg)
stock_kg    = roasted_stock.quantity_kg (0 if no row)
to_roast_kg = max(0, needed_kg − stock_kg)
pct         = products.green_percent ?? roasting_settings.default_green_percent
green_kg    = round2(to_roast_kg × (1 + pct/100))
```

Only coffees with `to_roast_kg > 0` are listed, sorted by earliest delivery
date among their orders. The list includes coffees whose product is no
longer active (an open order can reference one, e.g. Nicaragua Macucane).
A pure function (e.g. `src/lib/roasting.ts`) holds this arithmetic so it can
be unit-tested.

### 7. Screens (layout A, phone first)

Stock section title stays "Stock". Two tabs:

**À torréfier (n)** (default tab)
- Header line: "Vert = torréfié + % de perte" and the default chip
  "Par défaut 15 % ✎" (tap → small editor, saves to `roasting_settings`).
- One card per coffee: name; "Commandes à conditionner X kg"; "En stock − Y kg";
  **À torréfier** large; **Vert à peser** large in green, with its % chip
  (plain if default, copper if the coffee has its own; tap → edit this
  coffee's % or reset to default); full-width **Torréfié ✓** button.
- Empty state: "Rien à torréfier : le stock couvre toutes les commandes."
- **Torréfié** opens a bottom sheet: "Kilos sortis du torréfacteur", pre-filled
  with `to_roast_kg`, editable; shows "Stock après: A → B kg"; button
  "Ajouter au stock". Footnote: "Erreur ? Modifier le stock à la main dans
  l'onglet Stock torréfié."

**Stock torréfié**
- Today's search and Tous / Stock bas filters, search full width on phones.
- Phone: client-style cards (name, big kg, "seuil X kg", Stock bas / Non suivi
  badges, Modifier and Historique buttons). Wide screens keep the table.
- Only coffee products (`products.kind = 'coffee'`); delivery services no
  longer appear.
- Modifier (manual correction) and Historique stay as today; history shows
  the new change types with French labels (Conditionné, Remis en stock,
  Torréfaction, Correction manuelle, Livraison for old rows).

The same StockView is used by the admin dashboard and the roaster dashboard;
both get the tabs.

Existing phone-card tests in `src/test/admin-mobile-cards.test.tsx`
(list name "Stock", texts, button names) must keep passing or be updated
deliberately.

### 8. Torréfaction screen: one place to roast (owner's choice A)

RoasterView is used by the admin dashboard and the roaster dashboard
(`src/pages/RoasterDashboard.tsx`). The roaster role is the person who also
updates stock, so the two roasting screens must agree:

- **Totals per coffee** ("Total à torréfier" and the per-product rows) use the
  same pure function as the À torréfier tab: kilos after stock, and green
  kilos with the coffee's %. Date filters (today / tomorrow / this week /
  all) still apply to which orders are counted.
- **Each coffee gets the same "Torréfié" button** and bottom sheet as the
  À torréfier tab (shared component), which calls `add_roasted_stock`.
- **The per-order "Marquer torréfié" / "Mark All Roasted"** becomes
  **"Passer en conditionnement"**: it still sets `status = 'packaging'`
  (and `is_roasted = true` for the existing checklist), and never touches
  stock. Wording makes clear it only moves the order along.
- Batch suggestions stay, computed on kilos to roast after stock.
- Service lines (`order_items.kind = 'service'`, or the product's
  `kind = 'service'`) are never counted as coffee kilos (today they are).

## Release order

1. Migration: new column, settings table, product column, constraint,
   switch-over backfill, new triggers replacing the delivery trigger, RPC.
   In one transaction.
2. Frontend deploy.

The migration is safe before the frontend: the old screens keep working,
stock simply starts moving at bagging instead of delivery.

## Calls I made (owner to check)

- Moving an order back from "Prête à livrer" to an earlier status, or
  unticking Conditionné, puts its kilos back.
- **Deleting** an order that was already counted as bagged puts its kilos
  back (e.g. deleting a test order).
- Orders still at **Reçue** (not yet validated) count toward what to roast.
- If the items of an already-bagged order are edited afterwards, stock is not
  re-adjusted automatically; fix with Modifier.
- Stock still can't go below 0 (as today).
- Percentages are limited to 0–50 %.
- Torréfaction's batch suggestions are based on kilos to roast after stock.

## Left to the builder

- Exact trigger structure (BEFORE+AFTER pair vs depth guard).
- Component split of StockView (it is 566 lines; splitting the two tabs into
  their own files is encouraged).
- Query shape for open orders (one query with `order_items(product_id,
  quantity, kind)` is enough at current volume).
- Regenerating Supabase types after the migration.
