# 3kg Bag Display Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Products tagged `"sachet-3kg"` display quantity in bags ("10 sac(s)") instead of kg ("30 kg") in the client shop — no changes to cart, checkout, or Sellsy.

**Architecture:** Add a `renderValue` prop to `QuantityStepper` so the display label can be customised without touching the step/value logic. `ProductCard` detects the `"sachet-3kg"` tag and passes a bag-aware `renderValue`. The cart value (total kg) is untouched.

**Tech Stack:** React + TypeScript, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/components/QuantityStepper.tsx` | Add optional `renderValue?: (v: number) => string` prop |
| `src/components/ProductCard.tsx` | Detect `"sachet-3kg"` tag, pass `renderValue` + hint label |
| `src/test/bag-display.test.ts` | New — unit tests for bag label helpers |

---

## Task 1: Add `renderValue` prop to QuantityStepper

**Files:**
- Modify: `src/components/QuantityStepper.tsx`
- Test: `src/test/bag-display.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/bag-display.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Inline helpers — same logic that will live in ProductCard
const BAG_TAG = "sachet-3kg";
const BAG_KG = 3;

function isBagProduct(tags?: string[]): boolean {
  return tags?.includes(BAG_TAG) ?? false;
}

function bagLabel(totalKg: number): string {
  if (totalKg === 0) return "—";
  const bags = totalKg / BAG_KG;
  return `${bags} sac${bags > 1 ? "s" : ""}`;
}

describe("bag display helpers", () => {
  it("detects sachet-3kg tag", () => {
    expect(isBagProduct(["sachet-3kg", "origin-bresil"])).toBe(true);
  });

  it("returns false when tag absent", () => {
    expect(isBagProduct(["origin-bresil"])).toBe(false);
    expect(isBagProduct(undefined)).toBe(false);
  });

  it("shows singular for 1 bag (3 kg)", () => {
    expect(bagLabel(3)).toBe("1 sac");
  });

  it("shows plural for multiple bags", () => {
    expect(bagLabel(30)).toBe("10 sacs");
    expect(bagLabel(6)).toBe("2 sacs");
  });

  it("shows — for zero", () => {
    expect(bagLabel(0)).toBe("—");
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes (helpers are inline — no impl needed)**

```bash
cd /Users/saulsuaza/Documents/CLAUDE\ CODE\ PROJECTS/pluralroaster
npx vitest run src/test/bag-display.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Add `renderValue` prop to `QuantityStepper`**

Replace the entire file `src/components/QuantityStepper.tsx` with:

```typescript
import { Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  renderValue?: (value: number) => string;
}

export function QuantityStepper({ value, onChange, step = 3, min = 0, max = 999, className, renderValue }: QuantityStepperProps) {
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(Math.min(max, value + step));

  const label = renderValue
    ? renderValue(value)
    : value > 0
      ? `${Number.isInteger(value) ? value : value.toFixed(1)} kg`
      : "—";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={decrement}
        className="w-9 h-9 rounded-lg border border-border bg-secondary flex items-center justify-center text-foreground transition-colors duration-150 hover:bg-muted"
        aria-label="Decrease quantity"
      >
        <Minus className="w-4 h-4" />
      </motion.button>
      <span className="w-16 text-center font-mono text-sm tabular-nums font-medium text-foreground">
        {label}
      </span>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={increment}
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150",
          value > 0
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-secondary text-foreground hover:bg-muted"
        )}
        aria-label="Increase quantity"
      >
        <Plus className="w-4 h-4" />
      </motion.button>
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
npm run build 2>&1 | grep "error TS" | head -10
```

Expected: 0 errors. (The `renderValue` prop is optional — all existing callers continue to work unchanged.)

- [ ] **Step 5: Commit**

```bash
git add src/components/QuantityStepper.tsx src/test/bag-display.test.ts
git commit -m "feat(stepper): add optional renderValue prop for custom label display"
```

---

## Task 2: Bag display in ProductCard

**Files:**
- Modify: `src/components/ProductCard.tsx`

- [ ] **Step 1: Update `ProductCard` to detect the tag and use bag display**

Replace the entire file `src/components/ProductCard.tsx` with:

```typescript
import { motion } from "framer-motion";
import { RoastIcon } from "./RoastIcon";
import { QuantityStepper } from "./QuantityStepper";
import type { Product } from "@/lib/store";

const BAG_TAG = "sachet-3kg";
const BAG_KG = 3;

function bagLabel(totalKg: number): string {
  if (totalKg === 0) return "—";
  const bags = totalKg / BAG_KG;
  return `${bags} sac${bags > 1 ? "s" : ""}`;
}

interface ProductCardProps {
  product: Product;
  quantity: number;
  onQuantityChange: (product: Product, qty: number) => void;
}

export function ProductCard({ product, quantity, onQuantityChange }: ProductCardProps) {
  const isBag = product.tags?.includes(BAG_TAG) ?? false;

  return (
    <motion.div
      layout
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg shadow-subtle"
    >
      <RoastIcon roastLevel={product.roastLevel} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate" style={{ textWrap: "balance" }}>
          {product.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {product.origin} · <span className="font-mono tabular-nums">{product.sku}</span>
          {isBag && <span className="ml-1">· 3kg/sac</span>}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-medium tabular-nums text-foreground">
          €{product.pricePerKg.toFixed(2)}/kg
        </span>
        <QuantityStepper
          value={quantity}
          onChange={(qty) => onQuantityChange(product, qty)}
          renderValue={isBag ? bagLabel : undefined}
        />
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npm run build 2>&1 | grep "error TS" | head -10
```

Expected: 0 errors.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (including the 5 bag-display tests and all prior tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductCard.tsx
git commit -m "feat(shop): show quantity in bags for sachet-3kg tagged products"
```

- [ ] **Step 5: Push**

```bash
git push
```

---

## Manual Smoke Test

After implementation:

1. In the admin product editor, add the tag `"sachet-3kg"` to **Bresil** (or any test product).
2. Log in as a client.
3. Open the shop — Bresil should show `"3kg/sac"` hint in the subtitle and `"1 sac"` / `"2 sacs"` in the stepper (clicking + once = 3 kg in cart, shown as "1 sac").
4. Add 30 kg worth (click + ten times) — stepper shows `"10 sacs"`.
5. Go to checkout — total kg = 30, total price = 30 × pricePerKg (unchanged).
6. A product without the tag should show `"30 kg"` as before.
