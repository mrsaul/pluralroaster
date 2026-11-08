# Order price breakdown & Loberz delivery — design

Date: 2026-11-08 · Status: draft for approval

## Why

Clients see one number in the app after ordering (e.g. ZAÏA, order #476B4D48: **€756.00**) and a different one on the official Sellsy invoice (**€812.58 TTC**, invoice FACT-20260928-00128). They worry. The gap has two causes:

1. **Delivery is invisible in the app.** Sellsy bills the Loberz bike delivery; the app never adds it. Only 2 of the last 88 orders carried a delivery line.
2. **The tier discount is invisible.** The client's 5 / 10 / 15 % tier discount is silently baked into the coffee price. Nobody sees "−10 %", so nobody feels the benefit.

The owner also wants clients to *feel special*: show the regular price, their discount, and what they actually pay — for coffee and for delivery.

**Success:** for every new order, the total the client sees in the app equals the Sellsy invoice total **to the cent** (HT, each TVA line, TTC), and the client can read their savings.

## Goals

- Every new order includes a Loberz delivery line priced by weight band, with Plural's 50 % contribution shown.
- The client's tier discount is shown explicitly on coffee.
- One consistent breakdown (layout **B**, below) everywhere the client sees an order's price.
- The Sellsy invoice the app creates matches the breakdown to the cent.
- The owner can mark a client "Livraison gratuite" from the Clients section.

## Non-goals

- Changing how tier discount percentages are set (Pricing tiers screen stays as is).
- Rewriting past orders. Orders placed before this ships keep their stored lines and totals; they are not back-filled with delivery.
- Making delivery prices configurable in an admin screen (bands are fixed in code for now — see Constraints).

## Anti-goals (would be a failure even if it "works")

- Any new order where app total ≠ Sellsy invoice total, even by €0.01.
- The tier discount applied to delivery.
- A client who is set to free delivery being charged for it, or not seeing it as offered.

## The pricing rules (decided by the owner)

### Delivery (Loberz, "Livraison à vélo")

Full price, HT, by the order's **coffee weight** (kg):

| Coffee weight | Full price HT |
|---|---|
| up to and including 10 kg | €20 |
| more than 10 kg, up to and including 30 kg | €24 |
| more than 30 kg | €30 |

- **Plural pays 50 % of delivery, always, for every band.** Client pays €10 / €12 / €15 HT.
- The **tier discount never applies to delivery**. Delivery only ever gets the 50 %.
- Delivery TVA is **20 %** (as on the Sellsy invoice). Coffee TVA comes from each product's Sellsy rate (5.5 % for coffee), already implemented.
- **Free delivery:** the owner can switch on "Livraison gratuite" per client in the Clients section. Those clients pay €0 delivery.
- Weight counts coffee lines only (not service items). *(my call; owner accepted)*
- The Loberz service in Sellsy is now priced €24 (owner updated it). The app sends the band price on each invoice regardless, so Sellsy's default is only a fallback.

### Coffee

- Regular price = sum of coffee lines at catalogue price.
- Tier discount = the client's `pricing_tiers.product_discount_percent` (today: "30 kilos" 5 %, "100 kilos" 10 %, "+100 kilos" 15 %).
- No tier → no discount line.

### Worked example (ZAÏA, 30 kg Brésil at €28/kg, tier 10 %)

| | HT |
|---|---|
| Café 30 kg, prix public | 840.00 |
| Votre remise −10 % | −84.00 |
| **Votre prix café** | **756.00** |
| Livraison Loberz (11–30 kg) | 24.00 |
| Plural paie 50 % | −12.00 |
| **Votre livraison** | **12.00** |
| **Total HT** | **768.00** |
| TVA 5,5 % (on 756.00) | 41.58 |
| TVA 20 % (on 12.00) | 2.40 |
| **Total TTC** | **811.98** |

(The September invoice shows €25 → €12.50 delivery because the old Sellsy price was €25. Under the new bands this order is €24 → €12.)

## What the client sees — layout B "grouped blocks" (chosen by the owner)

Mockup: `.superpowers` brainstorm screen `price-breakdown.html`, option B. Three blocks:

1. **Café** — "30 kg · prix public" → "Votre remise −10 %" (green) → **"Votre prix café"**.
   No tier: just the weight and price, no remise line.
2. **Livraison à vélo** — "Loberz · <band label>" full price → "Plural paie 50 %" (green) → **"Votre livraison"**.
   Free-delivery client: full price → **"Livraison offerte"** (green) → **€0.00**. *(my call; owner accepted)*
3. **Total** — Total HT, TVA (one line per rate), **Total TTC**.

French labels as above; the app's English translation gets equivalents.

### Where it appears *(my call; owner accepted)*

- Checkout summary before "Confirmer la commande".
- Confirmation (success) screen.
- PDF receipt and the WhatsApp/plain-text share.
- Client order history (each order's detail).
- Admin → Commandes → order detail, so the owner sees exactly what the client saw.

Admin-created orders (Commandes → "+" / CreateOrderDialog) follow the **same** delivery and discount rules.

### Several orders, editing, cutover (decided by the owner unless marked)

- **Every order pays its own delivery**, banded on that order's own weight — even two orders from the same client for the same day. Delivery is charged per order, not per client or per day.
- **Admin edits** (quantity buttons, add/remove product on an order in Commandes): the coffee discount and the delivery band are **recalculated** from the new contents, so the stored order, the client's history and the Sellsy invoice still agree. *(my call)* This also fixes an existing bug: `recalcOrderTotals` in AdminDashboard drops the tier discount today.
- **Cutover:** today the owner adds the Loberz line by hand in Sellsy after the app creates the invoice. Once this ships the app adds it, and the owner stops adding it. Orders placed **before** launch have no delivery line; for those the owner keeps adding delivery by hand. The admin order detail should flag such orders ("Livraison à ajouter dans Sellsy") so neither double billing nor missing delivery happens. *(flag is my call)*

## Sellsy invoice

The app's invoice creation (`sellsy-sync`, mode `create-invoice`) must produce lines whose totals equal the breakdown:

- Coffee lines: as today. Discount mode is currently `'price'` — the discounted unit price is sent with no discount column — because Sellsy rejected the discount field earlier in 2026. **Keep this** *(my call)*; totals still match. If the builder confirms Sellsy now accepts the discount field (the ZAÏA invoice shows a "Remise 10 %" column), showing the regular price + remise on the invoice is welcome but optional.
- Delivery line: the Loberz service (Sellsy ref `0001`) at the band price with the 50 % applied, 20 % TVA. Free delivery: a €0 line labelled as offered *(my call)*.
- **Verify against real Sellsy behaviour.** The owner allows test invoices in the live Sellsy account **only as drafts ("brouillon")**, never finalised/official. Use them to confirm per-line rounding, how TVA is totalled (per line or per rate), fractional quantities (e.g. 0.25 kg bags), and whether the discount field is now accepted. Delete or clearly label the test drafts afterwards.
- **Rounding must be identical** between app and invoice. Sellsy rounds per line (unit price after discount to the cent, × quantity). The app must compute the breakdown the same way the invoice builder sends it — not "total × (1 − discount)" — otherwise odd prices (e.g. €28.50 × 0.95 = 27.075) drift by cents.

## Current state the builder should know

- Orders are created by RPC `create_order_with_items` (12-arg version) from `src/pages/Index.tsx` (`handleConfirmOrder`). It already stores `discount_percent` and `pricing_tier_name` on the order, and `kind` (`coffee`/`service`) on each `order_items` row. **Prices are sent by the client app**; the RPC trusts them.
- `orders.total_price` today = coffee HT after discount, no delivery.
- A delivery convention already exists in the invoice builder: an `order_items` row with `kind = 'service'` whose `price_per_kg` holds the flat fee and `quantity = 1`. The admin flags "⚠ Livraison 0 €" orders.
- `products` has the Loberz row (`sku = '0001'`, `kind = 'service'`, currently `is_active = false`, stale price €20). Service products are hidden from the client catalogue.
- `profiles.delivery_fee_override_cents` exists but is unused; clients now live in `companies` (orders have `company_id`). `pricing_tiers.delivery_discount_percent` exists (all 0) and is used only by CreateOrderDialog's display.
- Product tax rates come from Sellsy via product sync (`products.sellsy_tax_rate`); the sync was fixed on 2026-10-14 but **has not been run since**, so rates are still empty and the app falls back to 5.5 % for coffee. Run "run product sync" (Admin → Products) once before verifying invoice matching.
- Checkout TVA per rate: `computeVatLines` in `src/lib/orderUtils.ts`.

## Left to the builder

- Where the delivery bands live in code, and whether to compute delivery in the app or in the RPC (server-side is safer, since prices are currently client-trusted).
- How to store the delivery line so past orders redisplay exactly what the client saw even if bands change later (e.g. store full price and contribution, not just the net).
- Where the "Livraison gratuite" flag lives (a column on `companies` is the natural fit) and its switch in the client detail screen.
- Whether `orders.total_price` becomes total HT including delivery (matching Sellsy "Total net HT") — *my call: yes*, then check every screen that reads it (admin list, revenue, exports).
- What to do with the unused `profiles.delivery_fee_override_cents` and `pricing_tiers.delivery_discount_percent` (leave, or remove if truly unused).
- Tests: at least the band boundaries (10, 10.25, 30, 30.25 kg), free delivery, no-tier, and a rounding case.

## Calls I made (for the owner to check)

1. Delivery bands use coffee weight only.
2. Free-delivery clients see the full price crossed by "Livraison offerte" rather than no delivery block.
3. The breakdown appears on checkout, confirmation, PDF/share, client history, and admin order detail.
4. Past orders are not changed.
5. Sellsy coffee lines keep the discounted unit price (no remise column) unless Sellsy now accepts the discount field.
6. `orders.total_price` will include delivery, so the admin total matches Sellsy "Total net HT".
7. Admin edits to an order recalculate the discount and delivery band.
8. Orders placed before launch get a "Livraison à ajouter dans Sellsy" flag in the admin.
