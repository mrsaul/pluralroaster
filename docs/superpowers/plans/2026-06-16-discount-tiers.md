# Discount Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply per-client product discounts (5%, 10%, 15%) at checkout in Plural Pro and on Sellsy invoices, shown only on the PDF receipt and Sellsy invoice — never in the shop catalog.

**Architecture:** Three seeded tiers link to `companies.pricing_tier_id`. On order creation the discount percentage is captured on `orders.discount_percent`; `order_items.price_per_kg` keeps the full catalog price for traceability. The discount is applied at three points: in `handleConfirmOrder` (RPC call), in CheckoutPage totals, and in the Sellsy invoice row builder.

**Tech Stack:** Supabase Postgres (migration), React + TypeScript (Index.tsx, CheckoutPage.tsx, OrderReceiptPage.tsx, orderUtils.ts), Deno Edge Function (sellsy-sync)

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20260616000001_seed_pricing_tiers.sql` | Create — seed 3 tiers |
| `supabase/migrations/20260616000002_create_order_with_items_v4.sql` | Create — add discount params to RPC |
| `src/lib/orderUtils.ts` | Modify — add `discountPercent?` and `discountAmount?` to `OrderReceiptData` |
| `src/pages/Index.tsx` | Modify — add `clientTier` state, load tier in `syncUserRole`, apply discount in `handleConfirmOrder`, pass prop to CheckoutPage |
| `src/pages/CheckoutPage.tsx` | Modify — add `discountPercent` prop, show discount line, update receipt data |
| `src/pages/OrderReceiptPage.tsx` | Modify — add "Remise X%" row to totals |
| `supabase/functions/sellsy-sync/index.ts` | Modify — add `SELLSY_DISCOUNT_MODE`, load `discount_percent`, apply to product rows |

---

## Task 1: Database — seed pricing tiers

**Files:**
- Create: `supabase/migrations/20260616000001_seed_pricing_tiers.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Seed the 3 standard pricing tiers.
-- Admin can rename/adjust these at any time via the PricingTiersView UI.
INSERT INTO public.pricing_tiers (name, product_discount_percent, delivery_discount_percent)
VALUES
  ('Bronze', 5,  0),
  ('Argent', 10, 0),
  ('Or',     15, 0);
```

- [ ] **Step 2: Apply the migration**

```bash
cd /Users/saulsuaza/Documents/CLAUDE\ CODE\ PROJECTS/pluralroaster
npx supabase db push
```

Expected: migration applied, 3 rows in `pricing_tiers`.

- [ ] **Step 3: Verify**

```bash
npx supabase db execute --sql "SELECT name, product_discount_percent FROM pricing_tiers ORDER BY product_discount_percent;"
```

Expected:
```
 name   | product_discount_percent
--------+--------------------------
 Bronze |                        5
 Argent |                       10
 Or     |                       15
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260616000001_seed_pricing_tiers.sql
git commit -m "feat(db): seed Bronze/Argent/Or pricing tiers"
```

---

## Task 2: Database — add discount params to create_order_with_items RPC

**Files:**
- Create: `supabase/migrations/20260616000002_create_order_with_items_v4.sql`

This replaces the v3 function (same base params, adds `p_discount_percent` and `p_pricing_tier_name` with defaults so existing callers still work).

- [ ] **Step 1: Create the migration file**

```sql
-- v4: adds p_discount_percent and p_pricing_tier_name (both optional with defaults).
-- Drop the exact v3 signature first — PostgreSQL cannot replace a function
-- when the parameter list changes (it would create a second overload instead).
DROP FUNCTION IF EXISTS public.create_order_with_items(
  uuid, date, numeric, numeric, text, timestamptz, text, jsonb, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_user_id             UUID,
  p_delivery_date       DATE,
  p_total_kg            NUMERIC,
  p_total_price         NUMERIC,
  p_status              TEXT,
  p_confirmed_at        TIMESTAMPTZ,
  p_notes               TEXT,
  p_items               JSONB,
  p_reordered_from      UUID    DEFAULT NULL,
  p_delivery_address_id UUID    DEFAULT NULL,
  p_discount_percent    NUMERIC DEFAULT 0,
  p_pricing_tier_name   TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_item     JSONB;
BEGIN
  INSERT INTO orders (
    user_id, delivery_date, total_kg, total_price,
    status, confirmed_at, notes, discount_percent, pricing_tier_name
  ) VALUES (
    p_user_id, p_delivery_date, p_total_kg, p_total_price,
    p_status, p_confirmed_at, p_notes, p_discount_percent, p_pricing_tier_name
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, product_id, product_name, product_sku,
      price_per_kg, quantity, size_label, size_kg, kind
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'product_name')::TEXT,
      (v_item->>'product_sku')::TEXT,
      (v_item->>'price_per_kg')::NUMERIC,
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'size_label')::TEXT,
      (v_item->>'size_kg')::NUMERIC,
      COALESCE(v_item->>'kind', 'coffee')
    );
  END LOOP;

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Write the failing test**

Create `src/test/discount-tiers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Unit-test the discount math helper — no DB needed
function computeDiscountedTotal(productTotal: number, discountPercent: number): number {
  if (discountPercent <= 0) return productTotal;
  return Math.round(productTotal * (1 - discountPercent / 100) * 100) / 100;
}

describe("discount math", () => {
  it("applies 10% discount correctly", () => {
    expect(computeDiscountedTotal(280, 10)).toBe(252);
  });

  it("applies 5% discount correctly", () => {
    expect(computeDiscountedTotal(100, 5)).toBe(95);
  });

  it("applies 15% discount correctly", () => {
    expect(computeDiscountedTotal(200, 15)).toBe(170);
  });

  it("returns full total when discount is 0", () => {
    expect(computeDiscountedTotal(280, 0)).toBe(280);
  });

  it("rounds correctly at sub-cent level", () => {
    // 3 kg × €28.33/kg = €84.99, 10% off = €76.491 → rounded to €76.49
    expect(computeDiscountedTotal(84.99, 10)).toBe(76.49);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- discount-tiers
```

Expected: PASS — `computeDiscountedTotal` is defined inline in the test file; all 5 discount math cases pass. This validates the arithmetic before implementing it in Index.tsx (Task 5).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260616000002_create_order_with_items_v4.sql src/test/discount-tiers.test.ts
git commit -m "feat(db): add discount_percent + pricing_tier_name params to create_order_with_items"
```

---

## Task 3: Extend OrderReceiptData type

**Files:**
- Modify: `src/lib/orderUtils.ts` (lines 7-24)

- [ ] **Step 1: Write the failing test**

Add to `src/test/discount-tiers.test.ts`:

```typescript
import type { OrderReceiptData } from "@/lib/orderUtils";

describe("OrderReceiptData type", () => {
  it("accepts discountPercent and discountAmount fields", () => {
    const data: OrderReceiptData = {
      orderId: "abc",
      placedAt: new Date().toISOString(),
      deliveryDate: "2026-06-20",
      notes: null,
      items: [],
      totalHT: 252,
      vatRate: 0.20,
      totalTTC: 302.4,
      discountPercent: 10,
      discountAmount: 28,
    };
    expect(data.discountPercent).toBe(10);
    expect(data.discountAmount).toBe(28);
  });

  it("allows omitting discount fields (back-compat)", () => {
    const data: OrderReceiptData = {
      orderId: "abc",
      placedAt: new Date().toISOString(),
      deliveryDate: "2026-06-20",
      notes: null,
      items: [],
      totalHT: 280,
      vatRate: 0.20,
      totalTTC: 336,
    };
    expect(data.discountPercent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- discount-tiers
```

Expected: TypeScript error — `discountPercent` does not exist on `OrderReceiptData`.

- [ ] **Step 3: Add fields to OrderReceiptData in `src/lib/orderUtils.ts`**

Find the `OrderReceiptData` type (lines 7-24). Add two optional fields after `totalTTC`:

```typescript
export type OrderReceiptData = {
  orderId: string;
  placedAt: string;
  deliveryDate: string;
  notes: string | null;
  items: {
    name: string;
    sizeLabel: string | null;
    sizeKg: number | null;
    quantity: number;
    unitPrice: number | null;
    pricePerKg: number;
    kind?: 'coffee' | 'service';
  }[];
  totalHT: number;
  vatRate: 0.20;
  totalTTC: number;
  discountPercent?: number;
  discountAmount?: number;
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- discount-tiers
```

Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orderUtils.ts src/test/discount-tiers.test.ts
git commit -m "feat(types): add discountPercent and discountAmount to OrderReceiptData"
```

---

## Task 4: Load client tier in Index.tsx

**Files:**
- Modify: `src/pages/Index.tsx`

This task adds `clientTier` state and loads it in `syncUserRole`. The order creation change (using it) is Task 5.

- [ ] **Step 1: Add `clientTier` state after `deliveryFee` state (around line 144)**

Find this line:
```typescript
const [deliveryFee, setDeliveryFee] = useState<number>(20); // default fallback
```

Add immediately after it:
```typescript
const [clientTier, setClientTier] = useState<{ discountPercent: number; name: string } | null>(null);
```

- [ ] **Step 2: Add pricing_tier fields to the contacts SELECT in `syncUserRole` (around line 229)**

Find the contacts query select string (it's one long string). The `companies(...)` part currently ends with `company_addresses(label, address_line1, address_line2))`. Add `pricing_tier_id` and `pricing_tiers(product_discount_percent, name)` inside the `companies(...)` parentheses, before `company_addresses`:

Replace:
```typescript
.select("id, company_id, last_name, first_name, companies(id, onboarding_status, name, email, phone, siret, vat_number, legal_company_name, preferred_delivery_days, delivery_time_window, delivery_instructions, coffee_type, estimated_weekly_volume, grinder_type, notes, current_step, client_data_mode, company_addresses(label, address_line1, address_line2))")
```

With:
```typescript
.select("id, company_id, last_name, first_name, companies(id, onboarding_status, name, email, phone, siret, vat_number, legal_company_name, preferred_delivery_days, delivery_time_window, delivery_instructions, coffee_type, estimated_weekly_volume, grinder_type, notes, current_step, client_data_mode, pricing_tier_id, pricing_tiers(product_discount_percent, name), company_addresses(label, address_line1, address_line2))")
```

- [ ] **Step 3: Set `clientTier` after the onboarding check in `syncUserRole`**

After the `if (!contact || !company || company.onboarding_status !== "completed")` block returns to onboarding, the code continues to the happy path. Find this line in `syncUserRole`:

```typescript
await loadOrders();
```

Add **immediately after** that line:

```typescript
// Load discount tier for the client's company
const tier = (company?.pricing_tiers as any) ?? null;
setClientTier(
  tier && Number(tier.product_discount_percent) > 0
    ? { discountPercent: Number(tier.product_discount_percent), name: String(tier.name) }
    : null
);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat(index): load client pricing tier on session init"
```

---

## Task 5: Apply discount in handleConfirmOrder + pass prop to CheckoutPage

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Update `handleConfirmOrder` to apply the discount**

Find `handleConfirmOrder` (around line 408). It currently starts:

```typescript
const handleConfirmOrder = useCallback(async (deliveryDate: string, notes?: string): Promise<{ orderId: string }> => {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) {
    throw new Error("Votre session a expiré. Veuillez vous reconnecter.");
  }

  const coffeeItems = cart.items.map((item) => ({
```

After the `if (!user)` block and before `const coffeeItems`, add:

```typescript
// Apply product discount for this client's tier (services excluded)
const discountPct = clientTier?.discountPercent ?? 0;
const coffeeSubtotal = cart.totalPrice;
const discountedCoffeeTotal =
  discountPct > 0
    ? Math.round(coffeeSubtotal * (1 - discountPct / 100) * 100) / 100
    : coffeeSubtotal;
```

- [ ] **Step 2: Update the RPC call to use discounted total and pass discount params**

Find the existing RPC call:

```typescript
const { data: rpcResult, error: rpcError } = await (supabase as any).rpc("create_order_with_items", {
  p_user_id:            user.id,
  p_delivery_date:      deliveryDate,
  p_total_kg:           cart.totalKg,
  p_total_price:        cart.totalPrice + deliveryTotal,
  p_status:             "received",
  p_confirmed_at:       new Date().toISOString(),
  p_notes:              notes ?? null,
  p_items:              allItems,
  p_reordered_from:     reorderedFromId ?? null,
});
```

Replace with:

```typescript
const { data: rpcResult, error: rpcError } = await (supabase as any).rpc("create_order_with_items", {
  p_user_id:            user.id,
  p_delivery_date:      deliveryDate,
  p_total_kg:           cart.totalKg,
  p_total_price:        discountedCoffeeTotal + deliveryTotal,
  p_status:             "received",
  p_confirmed_at:       new Date().toISOString(),
  p_notes:              notes ?? null,
  p_items:              allItems,
  p_reordered_from:     reorderedFromId ?? null,
  ...(discountPct > 0 ? {
    p_discount_percent:  discountPct,
    p_pricing_tier_name: clientTier!.name,
  } : {}),
});
```

- [ ] **Step 3: Add `clientTier` to the `useCallback` dependency array**

Find the closing line of `handleConfirmOrder`'s `useCallback`:

```typescript
}, [cart, deliveryFee, deliveryService, loadOrders, reorderedFromId, toast]);
```

Replace with:

```typescript
}, [cart, clientTier, deliveryFee, deliveryService, loadOrders, reorderedFromId, toast]);
```

- [ ] **Step 4: Pass `discountPercent` prop to CheckoutPage**

Find the `<CheckoutPage` render (around line 570):

```tsx
<CheckoutPage
  items={cart.items}
  totalKg={cart.totalKg}
  totalPrice={cart.totalPrice}
  onBack={() => setView("home")}
  onConfirm={handleConfirmOrder}
  reorderedFromRef={reorderedFromId}
  deliveryFee={deliveryFee}
  deliveryServiceName={deliveryService?.name ?? 'Livraison à vélo par LOBERZ'}
  clientName={String((onboardingData as any)?.company_name ?? '')}
  onRemoveItem={(product, sizeLabel) => {
    cart.updateQuantity(product, 0, sizeLabel);
  }}
  onUpdateItem={(product, oldSizeLabel, qty, newSizeLabel, newSizeKg, newUnitPrice) => {
    if (newSizeLabel !== oldSizeLabel) {
      cart.updateQuantity(product, 0, oldSizeLabel);
    }
    cart.updateQuantity(product, qty, newSizeLabel, newSizeKg, newUnitPrice);
  }}
/>
```

Add `discountPercent={clientTier?.discountPercent ?? 0}` after `clientName`:

```tsx
<CheckoutPage
  items={cart.items}
  totalKg={cart.totalKg}
  totalPrice={cart.totalPrice}
  onBack={() => setView("home")}
  onConfirm={handleConfirmOrder}
  reorderedFromRef={reorderedFromId}
  deliveryFee={deliveryFee}
  deliveryServiceName={deliveryService?.name ?? 'Livraison à vélo par LOBERZ'}
  clientName={String((onboardingData as any)?.company_name ?? '')}
  discountPercent={clientTier?.discountPercent ?? 0}
  onRemoveItem={(product, sizeLabel) => {
    cart.updateQuantity(product, 0, sizeLabel);
  }}
  onUpdateItem={(product, oldSizeLabel, qty, newSizeLabel, newSizeKg, newUnitPrice) => {
    if (newSizeLabel !== oldSizeLabel) {
      cart.updateQuantity(product, 0, oldSizeLabel);
    }
    cart.updateQuantity(product, qty, newSizeLabel, newSizeKg, newUnitPrice);
  }}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: TypeScript error — `discountPercent` is not in CheckoutPage's props interface (intentional — fixed in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat(index): apply discount at order creation, pass discountPercent to CheckoutPage"
```

---

## Task 6: Discount display in CheckoutPage.tsx

**Files:**
- Modify: `src/pages/CheckoutPage.tsx`

- [ ] **Step 1: Add `discountPercent` to the props interface**

Find `CheckoutPageProps` (lines 12-34). Add `discountPercent?: number` after `clientName`:

```typescript
interface CheckoutPageProps {
  items: CartItem[];
  totalKg: number;
  totalPrice: number;
  onBack: () => void;
  onConfirm: (deliveryDate: string, notes?: string) => Promise<{ orderId: string }>;
  reorderedFromRef?: string | null;
  deliveryFee: number;
  deliveryServiceName: string;
  clientName?: string;
  discountPercent?: number;
  onRemoveItem?: (product: Product, sizeLabel?: string) => void;
  onUpdateItem?: (
    product: Product,
    oldSizeLabel: string | undefined,
    quantity: number,
    newSizeLabel?: string,
    newSizeKg?: number,
    newUnitPrice?: number,
  ) => void;
}
```

- [ ] **Step 2: Destructure the new prop in the function signature**

Find the function signature (around line 59):

```typescript
export default function CheckoutPage({
  items,
  totalKg,
  totalPrice,
  onBack,
  onConfirm,
  reorderedFromRef,
  deliveryFee,
  deliveryServiceName,
  clientName = '',
  onRemoveItem,
  onUpdateItem,
}: CheckoutPageProps) {
```

Add `discountPercent = 0,`:

```typescript
export default function CheckoutPage({
  items,
  totalKg,
  totalPrice,
  onBack,
  onConfirm,
  reorderedFromRef,
  deliveryFee,
  deliveryServiceName,
  clientName = '',
  discountPercent = 0,
  onRemoveItem,
  onUpdateItem,
}: CheckoutPageProps) {
```

- [ ] **Step 3: Add discount computations + update vatAmount and totalTTC**

Find these lines near the top of the component body (around line 87):

```typescript
const vatAmount = (totalPrice + deliveryFee) * VAT;
const totalTTC = totalPrice + deliveryFee + vatAmount;
```

Replace with:

```typescript
const discountAmount = Math.round(totalPrice * discountPercent / 100 * 100) / 100;
const discountedProductTotal = totalPrice - discountAmount;
const vatAmount = (discountedProductTotal + deliveryFee) * VAT;
const totalTTC = discountedProductTotal + deliveryFee + vatAmount;
```

- [ ] **Step 4: Add discount row to the review screen totals section**

Find the totals section in the review screen (around line 428):

```tsx
<div className="border-t border-border bg-muted/20 divide-y divide-border/50 text-sm">
  <div className="flex justify-between px-4 py-2">
    <span className="text-muted-foreground">Subtotal HT</span>
    <span className="tabular-nums text-foreground">€{totalPrice.toFixed(2)}</span>
  </div>
  {/* Delivery fee */}
  <div className="flex justify-between px-4 py-2">
```

Add the discount row between Subtotal HT and Delivery fee:

```tsx
<div className="border-t border-border bg-muted/20 divide-y divide-border/50 text-sm">
  <div className="flex justify-between px-4 py-2">
    <span className="text-muted-foreground">Subtotal HT</span>
    <span className="tabular-nums text-foreground">€{totalPrice.toFixed(2)}</span>
  </div>
  {discountPercent > 0 && (
    <div className="flex justify-between px-4 py-2">
      <span className="text-emerald-600 dark:text-emerald-400">Remise {discountPercent} %</span>
      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">−€{discountAmount.toFixed(2)}</span>
    </div>
  )}
  {/* Delivery fee */}
  <div className="flex justify-between px-4 py-2">
```

- [ ] **Step 5: Update `handleConfirm` to write discounted totalHT into receipt data**

Inside `handleConfirm`, find:

```typescript
const snap = [...items];
const snapTotal = totalPrice;
```

Add after those two lines:

```typescript
const snapDiscountAmount = Math.round(snapTotal * discountPercent / 100 * 100) / 100;
const snapDiscountedProductTotal = snapTotal - snapDiscountAmount;
```

Then find the `receiptData` inside `handleConfirm` (the one written to localStorage):

```typescript
const receiptData: OrderReceiptData = {
  orderId: orderId,
  placedAt: now,
  deliveryDate: deliveryDate,
  notes: notes.trim() || null,
  items: [
    ...snap.map((item) => ({
      name: item.product.name,
      sizeLabel: item.sizeLabel ?? null,
      sizeKg: item.sizeKg ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? null,
      pricePerKg: item.product.pricePerKg,
      kind: 'coffee' as const,
    })),
    ...(deliveryFee > 0 ? [{
      name: deliveryServiceName,
      sizeLabel: null,
      sizeKg: null,
      quantity: 1,
      unitPrice: deliveryFee,
      pricePerKg: deliveryFee,
      kind: 'service' as const,
    }] : []),
  ],
  totalHT: snapTotal + deliveryFee,
  vatRate: 0.20,
  totalTTC: (snapTotal + deliveryFee) * 1.20,
};
```

Replace with:

```typescript
const receiptData: OrderReceiptData = {
  orderId: orderId,
  placedAt: now,
  deliveryDate: deliveryDate,
  notes: notes.trim() || null,
  items: [
    ...snap.map((item) => ({
      name: item.product.name,
      sizeLabel: item.sizeLabel ?? null,
      sizeKg: item.sizeKg ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? null,
      pricePerKg: item.product.pricePerKg,
      kind: 'coffee' as const,
    })),
    ...(deliveryFee > 0 ? [{
      name: deliveryServiceName,
      sizeLabel: null,
      sizeKg: null,
      quantity: 1,
      unitPrice: deliveryFee,
      pricePerKg: deliveryFee,
      kind: 'service' as const,
    }] : []),
  ],
  totalHT: snapDiscountedProductTotal + deliveryFee,
  vatRate: 0.20,
  totalTTC: (snapDiscountedProductTotal + deliveryFee) * 1.20,
  ...(discountPercent > 0 ? {
    discountPercent,
    discountAmount: snapDiscountAmount,
  } : {}),
};
```

- [ ] **Step 6: Update the success screen to use discounted totals**

In the success screen (`if (step === "success")`), find:

```typescript
const snapHT  = confirmedTotal + confirmedDeliveryFee;
const snapVAT = snapHT * VAT;
const snapTTC = snapHT + snapVAT;
```

Replace with:

```typescript
const confirmedDiscountAmount = Math.round(confirmedTotal * discountPercent / 100 * 100) / 100;
const confirmedDiscountedTotal = confirmedTotal - confirmedDiscountAmount;
const snapHT  = confirmedDiscountedTotal + confirmedDeliveryFee;
const snapVAT = snapHT * VAT;
const snapTTC = snapHT + snapVAT;
```

- [ ] **Step 7: Update the `receiptData` object in the success screen (used by handleShare, handlePdf, handleCopy)**

Find the `receiptData` in the success screen:

```typescript
const receiptData: OrderReceiptData = {
  orderId:      confirmedOrderId ?? "",
  placedAt:     confirmedAt ?? new Date().toISOString(),
  deliveryDate: deliveryDate ?? "",
  notes:        notes.trim() || null,
  items: [
    ...confirmedItems.map(item => ({
      name:       item.product.name,
      sizeLabel:  item.sizeLabel ?? null,
      sizeKg:     item.sizeKg ?? null,
      quantity:   item.quantity,
      unitPrice:  item.unitPrice ?? null,
      pricePerKg: item.product.pricePerKg,
      kind:       'coffee' as const,
    })),
    ...(confirmedDeliveryFee > 0 ? [{
      name:       confirmedDeliveryServiceName,
      sizeLabel:  null,
      sizeKg:     null,
      quantity:   1,
      unitPrice:  confirmedDeliveryFee,
      pricePerKg: confirmedDeliveryFee,
      kind:       'service' as const,
    }] : []),
  ],
  totalHT:  snapHT,
  vatRate:  0.20,
  totalTTC: snapTTC,
};
```

Replace with:

```typescript
const receiptData: OrderReceiptData = {
  orderId:      confirmedOrderId ?? "",
  placedAt:     confirmedAt ?? new Date().toISOString(),
  deliveryDate: deliveryDate ?? "",
  notes:        notes.trim() || null,
  items: [
    ...confirmedItems.map(item => ({
      name:       item.product.name,
      sizeLabel:  item.sizeLabel ?? null,
      sizeKg:     item.sizeKg ?? null,
      quantity:   item.quantity,
      unitPrice:  item.unitPrice ?? null,
      pricePerKg: item.product.pricePerKg,
      kind:       'coffee' as const,
    })),
    ...(confirmedDeliveryFee > 0 ? [{
      name:       confirmedDeliveryServiceName,
      sizeLabel:  null,
      sizeKg:     null,
      quantity:   1,
      unitPrice:  confirmedDeliveryFee,
      pricePerKg: confirmedDeliveryFee,
      kind:       'service' as const,
    }] : []),
  ],
  totalHT:  snapHT,
  vatRate:  0.20,
  totalTTC: snapTTC,
  ...(discountPercent > 0 ? {
    discountPercent,
    discountAmount: confirmedDiscountAmount,
  } : {}),
};
```

- [ ] **Step 8: Verify TypeScript compiles clean**

```bash
npm run build 2>&1 | head -30
```

Expected: 0 TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add src/pages/CheckoutPage.tsx
git commit -m "feat(checkout): show discount line, write discounted totalHT to receipt data"
```

---

## Task 7: PDF receipt — add discount row to OrderReceiptPage.tsx

**Files:**
- Modify: `src/pages/OrderReceiptPage.tsx`

- [ ] **Step 1: Add a discount row to the totals section**

Find the totals section (around lines 292-313):

```tsx
<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
  <div style={{ width: 220, fontSize: 11 }}>
    {(
      [
        { label: "Sous-total HT", val: fmtEur(data.totalHT) },
        { label: "TVA 20 %", val: fmtEur(snapVAT) },
      ] as const
    ).map((row) => (
      <div
        key={row.label}
        style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}
      >
        <span>{row.label}</span>
        <span>{row.val}</span>
      </div>
    ))}
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 5px", fontSize: 14, fontWeight: 700, color: "#1A1A18", borderTop: "2px solid #1A1A18", marginTop: 3 }}>
      <span>Total TTC</span>
      <span>{fmtEur(data.totalTTC)}</span>
    </div>
  </div>
</div>
```

Replace with:

```tsx
<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
  <div style={{ width: 220, fontSize: 11 }}>
    {/* Sous-total HT (full catalog price before discount) */}
    {data.discountPercent != null && data.discountPercent > 0 ? (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}>
          <span>Sous-total HT</span>
          <span>{fmtEur(data.totalHT + (data.discountAmount ?? 0))}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#3a8a5a", borderBottom: "1px solid #e8e3db" }}>
          <span>Remise {data.discountPercent} %</span>
          <span>−{fmtEur(data.discountAmount ?? 0)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}>
          <span>Base HT remisée</span>
          <span>{fmtEur(data.totalHT)}</span>
        </div>
      </>
    ) : (
      <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}>
        <span>Sous-total HT</span>
        <span>{fmtEur(data.totalHT)}</span>
      </div>
    )}
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#6B6B63", borderBottom: "1px solid #e8e3db" }}>
      <span>TVA 20 %</span>
      <span>{fmtEur(snapVAT)}</span>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 5px", fontSize: 14, fontWeight: 700, color: "#1A1A18", borderTop: "2px solid #1A1A18", marginTop: 3 }}>
      <span>Total TTC</span>
      <span>{fmtEur(data.totalTTC)}</span>
    </div>
  </div>
</div>
```

Note: `data.totalHT` already contains the post-discount value (set in Task 6). So `data.totalHT + data.discountAmount` reconstructs the original catalog subtotal for the "Sous-total HT" line.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: PASS — all existing tests + new discount-tiers tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/OrderReceiptPage.tsx
git commit -m "feat(receipt): add discount row to PDF totals section"
```

---

## Task 8: Sellsy sync — apply discount to product rows

**Files:**
- Modify: `supabase/functions/sellsy-sync/index.ts`

- [ ] **Step 1: Add SELLSY_DISCOUNT_MODE constant**

Find the block of `Deno.env.get` declarations at the top of the file (around lines 23-27):

```typescript
const SELLSY_API_BASE_URL = Deno.env.get("SELLSY_API_BASE_URL");
const SELLSY_CLIENT_ID = Deno.env.get("SELLSY_CLIENT_ID");
const SELLSY_CLIENT_SECRET = Deno.env.get("SELLSY_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
```

Add immediately after that block:

```typescript
// 'field' = pass discount + discount_type on each product row (preferred: shows "−10%" on the invoice)
// 'price' = bake discount into unit_amount (fallback if Sellsy rejects the discount field)
// Switch to 'price' if Sellsy returns a 422 mentioning additionalProperties.
const SELLSY_DISCOUNT_MODE: 'field' | 'price' = 'field';
```

- [ ] **Step 2: Add `discount_percent` to the orders SELECT**

Find the SELECT query in the `create-invoice` handler (around line 1547):

```typescript
.select(`
  id, user_id, company_id, created_at, total_price,
  order_items (
    id, product_name, quantity, price_per_kg, size_label,
    products ( id, sellsy_id, sellsy_tax_id, sellsy_tax_rate, name, kind )
  )
`)
```

Replace with:

```typescript
.select(`
  id, user_id, company_id, created_at, total_price, discount_percent,
  order_items (
    id, product_name, quantity, price_per_kg, size_label,
    products ( id, sellsy_id, sellsy_tax_id, sellsy_tax_rate, name, kind )
  )
`)
```

- [ ] **Step 3: Extract discount percent before the row builder loop**

Find this line (around line 1646):

```typescript
console.log(`[invoice] building rows for ${orderItems.length} order items`);
```

Add immediately before it:

```typescript
const orderDiscountPct = Number((order as any).discount_percent ?? 0);
console.log(`[invoice] order discount: ${orderDiscountPct}%`);
```

- [ ] **Step 4: Apply discount to product catalog rows**

Find the coffee/catalog row builder (around line 1706):

```typescript
const row: JsonRecord = {
  type: "catalog",
  related,
  description: String(item.product_name ?? product.name ?? ""),
  unit_amount: String(item.price_per_kg ?? 0),
  quantity: String(item.quantity ?? 1),
};
```

Replace with:

```typescript
const baseUnitAmount = Number(item.price_per_kg ?? 0);
const discountedUnitAmount =
  orderDiscountPct > 0
    ? Math.round(baseUnitAmount * (1 - orderDiscountPct / 100) * 100) / 100
    : baseUnitAmount;

const row: JsonRecord = {
  type: "catalog",
  related,
  description: String(item.product_name ?? product.name ?? ""),
  unit_amount: SELLSY_DISCOUNT_MODE === 'field'
    ? String(baseUnitAmount)
    : String(discountedUnitAmount),
  quantity: String(item.quantity ?? 1),
  ...(SELLSY_DISCOUNT_MODE === 'field' && orderDiscountPct > 0
    ? { discount: orderDiscountPct, discount_type: 'percent' }
    : {}),
};
```

Service rows are NOT touched (they have their own code block above this one and must not receive a discount).

- [ ] **Step 5: Update the log line for the catalog row**

Find immediately after the `row` object:

```typescript
console.log(`[invoice] catalog row: product_sellsy_id=${product.sellsy_id} declination_id=${declinationId} qty=${row.quantity} unit=${row.unit_amount}`);
```

Replace with:

```typescript
console.log(`[invoice] catalog row: product_sellsy_id=${product.sellsy_id} declination_id=${declinationId} qty=${row.quantity} unit=${row.unit_amount} discount=${orderDiscountPct > 0 ? `${orderDiscountPct}% (${SELLSY_DISCOUNT_MODE})` : 'none'}`);
```

- [ ] **Step 6: Deploy the updated edge function**

```bash
npx supabase functions deploy sellsy-sync
```

Expected: `Deploy complete` with no errors.

- [ ] **Step 7: Smoke-test with a real order**

1. In the Plural Pro admin panel, find an order for a client who has a pricing tier assigned.
2. Click "Envoyer à Sellsy" for that order.
3. In Supabase edge function logs:
   ```bash
   npx supabase functions logs sellsy-sync --tail
   ```
   Expected: log line `[invoice] catalog row: ... discount=10% (field)` (or whatever their tier is).
4. Check the created invoice in Sellsy — product rows should show the discount percentage.
5. If Sellsy returns a 422 with "additionalProperties" in the error, change `SELLSY_DISCOUNT_MODE` to `'price'` and redeploy.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/sellsy-sync/index.ts
git commit -m "feat(sellsy): apply per-client product discount to invoice rows"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: PASS — all tests pass.

- [ ] **Step 2: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS|warning" | head -20
```

Expected: 0 TypeScript errors.

- [ ] **Step 3: Manual smoke-test — client with tier**

1. In AdminClientDetail, assign the "Argent" (10%) tier to a test client.
2. Log in as that client in Plural Pro.
3. Add products to cart (note their full prices).
4. Navigate to checkout — verify the totals show:
   - "Subtotal HT: €X" (full catalog price)
   - "Remise 10 %: −€Y" (green text)
   - "VAT (20%): €Z" (on discounted subtotal)
   - "Total TTC: €W" (discounted final)
5. Confirm the order.
6. Check the admin panel — order's `discount_percent` = 10, `pricing_tier_name` = "Argent".
7. Open the PDF receipt — verify it shows the full Sous-total HT, then Remise 10%, then Base HT remisée, then TVA, then Total TTC.
8. Send to Sellsy — check the invoice in Sellsy shows per-row discount or reduced unit price (depending on `SELLSY_DISCOUNT_MODE`).

- [ ] **Step 4: Manual smoke-test — client without tier**

1. Log in as a client with no tier assigned.
2. Go to checkout — verify no discount row appears, totals are unchanged from before.
3. Confirm the order — order's `discount_percent` = 0.
4. PDF receipt — no discount row.
5. Send to Sellsy — invoice rows have no discount fields.

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "feat: client discount tiers — end-to-end implementation complete"
```
