# Discount Tiers Design

## Goal

Apply per-client product discounts (5%, 10%, or 15%) automatically at checkout in Plural Pro and at Sellsy invoice sync, while showing no pricing change in the shop catalog.

## Architecture

Discounts are stored as a tier record linked to a company. The discount percentage is captured on the order at creation time (`orders.discount_percent`). Product `order_items` retain catalog prices for traceability; the discount is applied when computing totals (checkout summary, PDF receipt, Sellsy invoice rows). Services are never discounted.

## Tech Stack

- Supabase (Postgres migration for data seeding, existing RLS policies unchanged)
- React (Index.tsx, CheckoutPage.tsx, OrderReceiptPage.tsx)
- TypeScript (OrderReceiptData type extension)
- Deno / Supabase Edge Functions (sellsy-sync)

---

## Data Layer

### Pricing Tiers Seed (migration)

Insert 3 rows into the existing empty `pricing_tiers` table:

| name   | product_discount_percent | delivery_discount_percent |
|--------|--------------------------|---------------------------|
| Bronze | 5                        | 0                         |
| Argent | 10                       | 0                         |
| Or     | 15                       | 0                         |

No schema changes required. All columns (`product_discount_percent`, `delivery_discount_percent`, `name`, `id`) already exist.

### Existing columns used (no migration needed)

- `orders.discount_percent` — set at order creation
- `orders.pricing_tier_name` — set at order creation (human-readable label)
- `companies.pricing_tier_id` — FK to `pricing_tiers`; set via existing AdminClientDetail tier selector

---

## Client Checkout Flow

### Tier loading (`Index.tsx`)

When the client's session initializes (inside `handleAuthenticatedSession` / `syncUserRole`), fetch their company tier alongside existing queries:

```sql
SELECT pricing_tier_id, pricing_tiers(product_discount_percent, name)
FROM companies
WHERE id = <companyId>
```

Store as `clientTier: { discountPercent: number; name: string } | null` in component state. No extra call at order time.

### Order creation (`handleConfirmOrder` in `Index.tsx`)

- If `clientTier` is set and `discountPercent > 0`:
  - Pass `discount_percent: clientTier.discountPercent` and `pricing_tier_name: clientTier.name` to the `orders` INSERT
  - Compute discounted product subtotal: `productSubtotal × (1 − discountPercent / 100)`
  - Service subtotal is unchanged
  - Total HT = discounted product subtotal + service subtotal

### Checkout summary (`CheckoutPage.tsx`)

Display a "Remise X%" line in the order breakdown before TVA. The total shown to the client before confirming already reflects the discount.

`OrderReceiptData` written to `localStorage` gains:
- `discountPercent?: number`
- `discountAmount?: number` (computed savings, for display only)

---

## PDF Receipt (`OrderReceiptPage.tsx`)

Add a discount row between "Sous-total HT" and "TVA 20 %", rendered only when `discountPercent > 0`:

```
Sous-total HT              €280,00
Remise 10 % (Argent)      −€28,00
Base HT remisée            €252,00
TVA 20 %                   €50,40
─────────────────────────────────
Total TTC                  €302,40
```

The `totalHT` already passed in is the post-discount value. No re-computation needed in the receipt page.

---

## Sellsy Sync (`supabase/functions/sellsy-sync/index.ts`)

### Query change

Add `discount_percent` and `pricing_tier_name` to the orders SELECT.

### Invoice row change

For each **product** row (`related.type !== 'service'`), conditionally add:

```ts
...(discountPercent > 0
  ? { discount: discountPercent, discount_type: 'percent' }
  : {})
```

Service rows: no discount fields added.

### Fallback

If Sellsy returns a 422 with an `additionalProperties` error on the `discount` field, switch to reducing `unit_amount` directly:

```ts
unit_amount: Math.round(pricePerKg * (1 - discountPercent / 100) * 100) / 100
```

A `SELLSY_DISCOUNT_MODE` constant at the top of the file toggles between `'field'` (default) and `'price'` so it can be switched without a code change if needed.

---

## What Is NOT Changing

- Shop catalog: product prices shown unchanged for all clients
- Admin `CreateOrderDialog`: already applies tier discount at admin order creation — no change
- `PricingTiersView` CRUD UI: works as-is once data is seeded
- `AdminClientDetail` tier selector: works as-is
- Service pricing: never discounted in any flow
- RLS policies: no changes needed (tier data is read by client via company join, already allowed)

---

## Scope Boundary

This spec does not cover:
- Showing discount breakdown in the in-app order history list (only the discounted total appears there, same as now)
- Retroactive discounting of past orders (existing `orders.discount_percent = null` rows are treated as 0%)
- WhatsApp/email notifications mentioning the tier (separate feature)
