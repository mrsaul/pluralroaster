# Negotiated pricing rules per tier — design

Date: 2026-11-20 · Status: ready for owner approval · Branch: `feat/tier-rules`

## Why

Plural negotiates terms with each B2B client. Today a client's tier (`pricing_tiers`) gives one
percentage on all the coffee of an order (`product_discount_percent`), whatever the order looks like.
Deals like AMULETTE's can't be expressed:

- 150 g / 250 g bags (retail): always 5 %
- coffee sold by the kg: 5 % under 20 kg in the order, 10 % from 20 kg

The owner wants each client's negotiated terms set in the app, applied automatically on every order,
shown to the client, and invoiced identically in Sellsy.

## Decided with the owner

- **Approach A — richer tiers.** No second system: the rules live on `pricing_tiers`. A client with a
  personal deal gets their own tier (e.g. a tier named "AMULETTE" assigned only to her). Chosen over a
  per-client override (two systems that can contradict) and a free rule builder (more than the deals need).
- A tier holds: **remise café au kg** (%), **remise sachets** (%), and an optional **palier de volume**:
  from X kg of coffee by the kg in the order, the kg rate becomes Y %.
- The volume threshold counts **only kilos sold by the kg, in that one order**; bags never count, nothing
  carries over between orders. "From 20 kg" is inclusive (20 kg → 10 %).
- One order can carry two rates (kg lines at one rate, bag lines at another).
- Delivery is unchanged: Loberz band by coffee weight, Plural pays 50 % (100 % with "Livraison gratuite").
  The tier never discounts delivery.
- The client summary shows one discount line per rate actually used.
- **The client sees their terms and a nudge while shopping** (owner's choice): the cart and the checkout
  summary show "Vos conditions : café au kg −5 % · dès 20 kg −10 % · sachets −5 %" (only the parts the
  tier has; nothing for clients without a tier). When the tier has a volume step and the cart's coffee
  by the kg is below it, a line shows "Plus que X kg pour passer à −Y %" (X = threshold − current kg by
  the kg, formatted fr-FR; my call: shown whenever the cart has coffee by the kg below the step, hidden once
  reached, and replaced by "Remise −Y % atteinte" when reached).
- Sellsy invoices carry the discount per line; totals match the app to the cent (same rounding as today).
- Existing tiers keep their exact behaviour: "30 kilos" → kg 5 % / bags 5 %, "100 kilos" → 10 % / 10 %,
  "+100 kilos" → 15 % / 15 %, no volume step.

## My calls (owner may overrule)

- **What is a bag:** a line with a sub-kilo size (`size_kg` > 0 and < 1: 150 g, 250 g). 1 kg and 3 kg
  packs and plain kg lines are "coffee by the kg". Their weight counts toward the volume threshold.
- **Rates are frozen per order:** each coffee line stores the rate applied at placement
  (`order_items.line_discount_percent`, already used by the delivery row). Changing a tier later never
  reprices existing orders, their invoices, or admin edits of them.
- **Admin edits re-evaluate the threshold with the order's frozen rules:** when an admin changes
  quantities, the kg rate is recomputed (an edit that crosses 20 kg moves AMULETTE's kg lines to 10 %),
  using the rule set stored on the order at placement, not the tier's current values.
- **Reorder keeps bags as bags (in scope):** today "Recommander" turns bag lines into plain kg lines at
  the per-kg price (`loadOrders` in `Index.tsx` and `mapPersistedOrder` don't load `size_kg`,
  `size_label` or the bag price). With per-type rates that would charge bags the kg rate and count them
  toward the volume threshold, so the order query, the mapping and cart hydration must carry bag lines
  through.
- **Sellsy shows prices as today:** each invoice line's discount stays folded into its unit price
  (`SELLSY_DISCOUNT_MODE = 'price'`), now with that line's own rate. No visible "−5 %" column on the
  invoice (Sellsy v2 rows don't accept the discount field), so the cent-for-cent match is preserved.
- **The tier's delivery discount setting goes away from the editor:** `pricing_tiers.delivery_discount_percent`
  is never read by pricing (free delivery is `companies.free_delivery`) and is 0 on all three live tiers
  (checked 2026-11-20). Remove it from the Tarifs form, cards/table and the client-window chips; keep the
  column in the database.
- `orders.discount_percent` keeps a meaning for old screens/exports: the kg rate actually applied
  (falls back to 0). `orders.pricing_tier_name` unchanged.

## Goals

1. Tier editor (Tarifs) with the three settings; list/cards show them in plain words
   ("Café au kg −5 % · dès 20 kg −10 % · Sachets −5 %").
2. One pricing function used everywhere (shop checkout, admin manual order, admin order edit, client
   summary + PDF + saved snapshot, admin compare dialog, Sellsy invoice, Google Sheet export, new-order
   email) — today's `computeOrderBreakdown` / `_shared/order-vat.ts` pair extended, still mirrored.
3. Client sees, before confirming: regular price, each discount line, delivery, HT / VAT / TTC; and while
   shopping, their terms plus the volume-step nudge (cart and checkout).
4. Sellsy draft totals equal the app's to the cent for mixed-rate orders.

## Non-goals

- Discounts by product, origin or category ("−8 % on Golden Huila"). Not needed by current deals.
- Volume measured over a month or across orders.
- Rules on delivery.
- Client-specific prices (a fixed €/kg) instead of percentages.

## Anti-goals

- A client sees one total and gets invoiced another.
- Changing a tier silently reprices orders already placed.
- Two places to look to know what a client pays.
- A client's existing price changes the day this ships (existing tiers must behave exactly as today).

## Data

`pricing_tiers` (keep `product_discount_percent` for compatibility, but it is no longer read for pricing):

- `kg_discount_percent numeric not null` — backfilled from `product_discount_percent`
- `bag_discount_percent numeric not null` — backfilled from `product_discount_percent`
- `volume_threshold_kg numeric null` and `volume_kg_discount_percent numeric null` — both set or both
  null (check constraint); threshold > 0; all percents 0–100.

Order placement stores the rule set used: `orders.pricing_rules jsonb`
(`{kg, bag, thresholdKg, kgAbove}`), and each coffee `order_items` row its applied
`line_discount_percent`. Orders without `pricing_rules` (all existing ones) keep pricing from
`orders.discount_percent` exactly as today.

## Pricing rule (single source of truth)

Inputs: coffee lines (price/kg, kg, VAT rate, isBag), the rule set, delivery input.

1. `kgByKgLines` = sum of kg of non-bag lines.
2. kg rate = `kgAbove` if threshold set and `kgByKgLines ≥ thresholdKg`, else `kg`.
3. bag rate = `bag`.
4. Per line: unit = round2(price/kg × (1 − rate/100)) when rate > 0, else raw price (today's rule);
   line net = round2(unit × kg). VAT per rate on the summed bases, as today.
5. Breakdown exposes `coffee.discounts: [{ label: "kg" | "bag", percent, discountHT }]` (only rates > 0
   that apply to at least one line) instead of the single `discountPercent`; `regularHT`, `netHT`,
   delivery, totals unchanged in meaning.

## Surfaces to update

- `src/lib/pricing.ts` + `supabase/functions/_shared/order-vat.ts` (mirror; shared tests).
- Checkout (`CheckoutPage`, `Index.tsx` RPC args): pass per-line rates and `pricing_rules`;
  `create_order_with_items` gets `p_pricing_rules jsonb DEFAULT NULL` and writes
  `line_discount_percent` from each item (`p_items[].line_discount_percent`). Follow the v6 migration
  pattern (drop old overload, keep the 8-arg legacy, grants, revoke anon). Old cached apps keep working:
  missing args → today's behaviour.
- Admin manual order (`CreateOrderDialog`), admin edit (`recalcOrderFromItems` / `recalcOrder`).
- `PriceBreakdown` + `OrderReceiptPage` + plain-text summary: one discount line per rate
  ("Remise café au kg −10 %", "Remise sachets −5 %").
- Client snapshot / compare dialog: snapshot carries the new breakdown; diff unchanged in principle.
- `sellsy-sync`: per-line discount from `line_discount_percent` (fallback to order discount for old
  orders). `export-invoicing-sheet`, `notify-new-order`: same per-line logic via the shared module.
- Client cart + checkout: "Vos conditions" line and volume-step nudge, from one shared plain-words helper
  (the same helper writes the Tarifs card summary and the client-window chips).
- Tarifs (`PricingTiersView`): form fields + plain-words summary on cards/table; client window tier
  chips show the summary.

## Testing

- Pricing unit tests (both mirrors): AMULETTE 19.75 kg vs 20 kg (inclusive), bags never counted,
  mixed order two rates, 1 kg/3 kg packs count as kg, and legacy single-rate tiers equal today's totals
  for the reference orders verified against Sellsy during the delivery feature (current catalogue:
  Cauca €26.50/kg, Brésil 250 g bag €9.50, coffee VAT 5.5 %, delivery VAT 20 %):
  - A' — tier 5 %, 30 kg Cauca + 3 kg Brésil by the kg, delivery 50 %: HT 850.20 · VAT 45.94 + 3.00 · TTC 899.14
  - A — tier 5 %, 30 kg Cauca, delivery 50 %: HT 767.40 · VAT 41.55 + 2.40 · TTC 811.35
  - B — tier 15 %, 1 × Brésil 250 g + 10 kg Cauca, delivery 50 %: HT 245.38 · VAT 12.84 + 2.40 · TTC 260.62
    (already in `src/test/admin-order-lines.test.ts`)
  - C — tier 5 %, free delivery, 5 kg Cauca: HT 125.90 · VAT 6.92 · TTC 132.82
  The builder reads the exact unit prices from `src/test/pricing.test.ts` / the catalogue and adjusts
  line inputs (not expected totals) if a price differs.
- Old order (no `pricing_rules`) priced exactly as before.
- Admin edit crossing the threshold uses frozen rules.
- Sellsy draft check with the owner on TEST POPULAIRE: an AMULETTE-like tier, an order of 22 kg + 4 bags,
  app total = Sellsy draft total.

## Left to the builder

- Exact form layout in Tarifs, within the existing shadcn look.
- Migration naming and how the RPC receives per-line rates (as long as old clients keep working).
- Whether `PricedCoffeeLine` gets `isBag` or a precomputed `discountPercent`.
