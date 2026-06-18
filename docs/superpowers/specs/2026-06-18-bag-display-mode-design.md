# 3kg Bag Display Mode Design

## Goal

For products sold in 3kg bags (Bresil, Golden Huila and Cauca, Perou, Espresso Populaire, etc.), show the quantity in bags ("10 sac(s)") instead of kg ("30 kg") in the client-facing shop. All downstream systems (cart, checkout, PDF receipt, Sellsy) are unchanged.

## Architecture

Tag-based, display-only. Products flagged with the `"sachet-3kg"` tag render their quantity in bag units inside `ProductCard`. The underlying cart value remains total kg, so no data model, checkout, or Sellsy changes are needed.

## Tech Stack

- React + TypeScript (`ProductCard.tsx`, `QuantityStepper.tsx`)
- Existing `product.tags` array (no schema change)

---

## Data Layer

No migration required. An admin adds the tag `"sachet-3kg"` to a product's `tags` array via the existing product editor (`AddProductDialog` / `ProductVariantsEditor`). The tag is stored in `products.tags` (already a text array column).

---

## Client Shop — `ProductCard`

When `product.tags?.includes("sachet-3kg")` is true:

| Element | Current | New |
|---|---|---|
| Quantity display | `"30 kg"` | `"10 sac(s)"` |
| Hint below name | — | `"3kg/sac"` in muted text |
| Price label | `"€X/kg"` | `"€X/kg"` (unchanged) |
| Stepper step | 3 (default) | 3 (unchanged) |
| Cart value | 30 (kg) | 30 (kg) (unchanged) |

The `QuantityStepper` component receives the same `value` (total kg) and `step=3`. The built-in `"{value} kg"` label is replaced by a custom `renderValue` prop: when bag mode is active, `renderValue={(v) => v === 0 ? "—" : `${v / 3} sac${v / 3 > 1 ? "s" : ""}`}`.

## What Is NOT Changing

- `QuantityStepper` default step (already 3)
- Cart item structure (`quantity` = total kg, no `sizeKg`)
- `CheckoutPage` totals and item rows
- `OrderReceiptPage` PDF layout
- `sellsy-sync` edge function invoice rows
- Admin `CreateOrderDialog`
- Pricing / discount logic

## Scope Boundary

- Only `ProductCard.tsx` and `QuantityStepper.tsx` (add `renderValue` prop) are touched.
- Tag must be added manually per product in the admin — no bulk migration of existing products.
- If a product has both `"sachet-3kg"` and a size variant, bag mode takes precedence for display (variants are hidden for bag products — clients don't choose a size, the bag size is fixed at 3kg).
