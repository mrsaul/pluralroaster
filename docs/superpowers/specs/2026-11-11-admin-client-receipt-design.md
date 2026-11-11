# Admin view of the client's order summary — design

Date: 2026-11-11 · Status: ready for owner approval · Scope: step 1 only

## Why

When a client validates an order, the app shows them a summary: products, regular price, tier
discount, Loberz delivery with Plural's 50 %, total HT, VAT per rate, TTC (layout B,
`PriceBreakdown`), plus a printable "PDF" version (`/order-receipt`). That document is built in the
client's browser and never saved. Nobody can open it later.

The owner checks every order against the Sellsy invoice, with Sellsy open in another browser tab
on a computer. To settle disputes ("the app told me €X"), the owner needs to see exactly what the
client saw, and, when the order was edited afterwards, what the client saw next to what will be
invoiced.

## Goals

1. Save, at the moment the client validates, a frozen copy of the summary the client saw.
2. In the admin order detail (Commandes), show that copy in the same layout the client saw.
3. When the order was edited after validation, show the client's copy next to the current
   version ("à facturer"), with the differences highlighted and the HT difference in a badge.
4. Orders created by hand in admin also save a copy, marked "créée par l'admin".

## Non-goals

- Reading totals back from Sellsy (step 2, later, separate design).
- Showing clients the comparison. Clients never see admin edits compared.
- Rebuilding copies for orders placed before this ships.
- Per-line negotiated discounts (AMULETTE deal), parked as a separate project.

## Anti-goals (failure even if it "works")

- A "client copy" that is recomputed from current prices or current order lines. It must be the
  frozen copy or nothing. Showing a rebuilt version as "what the client saw" is worse than showing
  "non disponible".
- A client copy that a client (or a later admin edit) can overwrite.
- Breaking order placement: if saving the copy fails, the order must fail as a whole (same
  transaction), never be placed without its copy, and never be placed twice.

## Decided by the owner

- Original next to current when the order was edited, differences made obvious.
- Built for a computer screen next to the Sellsy tab.
- Step 1 only.
- The draft "Commander" button goes through the summary page first (see Checkout).
- Same layout B for both columns.
- The saved copy can never change once the order is placed, for any role.

## Design

### Data

- New column `orders.client_snapshot jsonb` (nullable). Null = no copy (older orders).
- Content: the same `OrderReceiptData` object the checkout already builds for the PDF
  (`src/pages/CheckoutPage.tsx`, `receiptData`), including the full `breakdown`
  (`OrderBreakdown`), plus `source: "client" | "admin"` and `version: 1`.
- Saved atomically by the order RPC: `create_order_with_items` gets a new optional
  `p_client_snapshot jsonb DEFAULT NULL` argument and writes it in the same INSERT as the order.
  Follow the pattern of migration `20261108000000_order_delivery_breakdown.sql`: drop the current
  13-arg overload, create the 14-arg one, keep the legacy 8-arg overload, same grants, revoke
  `anon`. Old app versions still cached on phones call without the argument and keep working
  (the default applies); their orders simply have no copy.
- The snapshot needs the real order id: the RPC fills `orderId` inside the stored JSON
  (`jsonb_set(p_client_snapshot, '{orderId}', to_jsonb(v_order_id))`).
- Admin manual orders (`src/components/CreateOrderDialog.tsx`) write the column directly in their
  `orders` insert, with `source: "admin"`.
- Write-once, for everyone (owner's decision): a trigger on `orders` rejects any UPDATE that changes
  `client_snapshot` once it is non-null, whatever the role (client, packaging, admin). On direct
  INSERTs into `orders` (the "Users can create their own orders" policy), the trigger forces
  `client_snapshot` to NULL unless the caller is admin; the RPC is SECURITY DEFINER and sets it
  inside the function, so client copies only ever come from the RPC. Admin manual orders set it in
  their INSERT (admin is allowed), so no update path is needed.

### Checkout

- Every client order goes through the summary page (owner's decision). Today the draft
  "Commander" button in order history (`src/pages/OrderHistoryPage.tsx` ~line 239 →
  `handlePlaceDraftOrder` → `handleConfirmOrder` in `src/pages/Index.tsx` ~line 472) places the
  order directly, showing only `€{draftTotalPrice}`. It must instead load the draft into the
  checkout summary (`CheckoutPage`) with its delivery date, where the client confirms as usual.
  Afterwards no client path calls the order RPC without a snapshot.

- `src/pages/Index.tsx` (the RPC call) receives the receipt data built from the same cart and
  breakdown the client is looking at, and passes it as `p_client_snapshot`. The confirmation screen
  and the stored copy must come from one object, so they can't drift.
- Known drift to remove (my call): today `CheckoutPage` builds its summary from its own props
  (`discountPercent`, `freeDelivery`) while `Index.tsx` computes the RPC totals from `clientTier`
  and `cart.items`. The builder makes the RPC arguments (`p_total_price`, `p_delivery`,
  `p_discount_percent`) and the snapshot come from the single `OrderBreakdown` the client is shown.
- Consistency check in the RPC (my call): placement never fails because of the copy. If the copy's
  `totalHT` differs from `p_total_price` by more than €0.01, the RPC still stores it and also sets
  `client_snapshot.mismatch = true`; the admin dialog then shows a red "Copie incohérente avec la
  commande enregistrée" warning instead of "Modifiée après validation".

### Admin order detail

Location: the order Sheet in `src/pages/AdminDashboard.tsx` (around the "Order {id}" Sheet,
currently showing `PriceBreakdown` for `storedOrderBreakdown(...)`).

- New "Récapitulatif" section with a button "Comparer avec le récapitulatif client" that opens a
  wide dialog (the Sheet is too narrow for two columns).
- Left column "Vu par le client · validée le {date heure}": rendered from `client_snapshot`
  (items + layout B breakdown, same French copy as the client receipt).
- Right column "Actuelle (à facturer)": rendered live from the current order lines
  (`storedOrderBreakdown`), in the same layout B as the left column so lines face each other
  (owner's decision; one shared receipt component draws both columns). Layout B already follows the Sellsy
  order: coffee, then Loberz delivery, then HT, VAT per rate, TTC. Totals HT / VAT / TTC are the
  numbers to compare with the Sellsy tab; Sellsy's per-row kg × €/kg detail is not reproduced.
- When both are identical (same lines, quantities, prices, same totals to the cent): show only the
  client column with an "Identique à la commande" mark.
- When they differ: show both, highlight lines that were added, removed or changed, and a badge
  "Modifiée après validation · ±€x HT".
- No copy: show the current version only, with "Récapitulatif client non disponible (commande
  antérieure au …)".
- Admin-created orders: label "Créée par l'admin" instead of "Vu par le client".
- Print button (browser print of the dialog content).
- On narrow screens the two columns stack.

### Testing

- Unit: the diff function (snapshot vs current breakdown → identical / list of changed lines /
  HT difference), with cases: identical, quantity changed, line added, line removed, delivery band
  changed, rounding-only differences that must count as identical when cents match.
- RPC: placing an order with and without `p_client_snapshot`; the stored `orderId` matches.
- Manual: place a client order on SAUL TEST, open it in admin → identical; edit a quantity → both
  columns, highlight and badge; old order → "non disponible".

## Left to the builder

- Exact diff matching key for lines (product + size is the natural one).
- Dialog component choice and styling, within the existing shadcn/Tailwind admin look.
- Whether the PDF route `/order-receipt` reuses a shared receipt component with the admin
  dialog (preferred if cheap).
