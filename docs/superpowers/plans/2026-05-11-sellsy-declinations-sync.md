# Sellsy Declinations Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the product sync to pull ALL data from Sellsy API v2, including Declinations (variants/sizes like 250g, 1kg, 3kg), making Sellsy the single source of truth for products and variants while hiding all manually created variants.

**Architecture:** A new DB migration adds `sellsy_declination_id` and `source` columns to `product_variants` (marking existing rows as manual/inactive), and `product_variant_id` to `order_items`. The Sellsy sync Edge Function is extended to fetch declinations per item (with a 150ms delay), upsert them, and deactivate removed ones. The frontend catalog and admin views are updated to only display Sellsy-sourced active variants; the manual `ProductVariantsEditor` is replaced with a read-only info panel.

**Tech Stack:** Supabase Edge Functions (Deno), Supabase JS client, Sellsy API v2, React + TypeScript, Tailwind CSS, shadcn/ui

---

## File Structure

### Files to Create
- `docs/superpowers/plans/2026-05-11-sellsy-declinations-sync.md` — this plan

### Files to Modify
- `supabase/migrations/<timestamp>_sellsy_declinations.sql` — new migration adding columns to `product_variants`, `order_items`
- `supabase/functions/sellsy-sync/index.ts` — extend with declination fetch + upsert logic
- `src/lib/store.ts` — update `ProductVariant` interface with Sellsy fields
- `src/pages/CatalogPage.tsx` — filter variants to `source='sellsy'` only
- `src/components/ProductCard.tsx` — no change needed (already uses `ProductVariant`)
- `src/components/ProductDetailSheet.tsx` — no change needed (already uses `ProductVariant`)
- `src/components/ProductVariantsEditor.tsx` — replace with read-only Sellsy info panel
- `src/components/CreateOrderDialog.tsx` — pass `product_variant_id` to `order_items`
- `src/pages/AdminDashboard.tsx` — update sync controls panel with variant count

---

## Task 1: DB Migration — Add Declination Columns

**Files:**
- Create: `supabase/migrations/<timestamp>_sellsy_declinations.sql`

- [ ] **Step 1: Generate the migration filename**

```bash
cd /Users/saulsuaza/Documents/CLAUDE\ CODE\ PROJECTS/pluralroaster/pluralroaster
date +%Y%m%d%H%M%S
```

Use the output timestamp for the filename: `supabase/migrations/<timestamp>_sellsy_declinations.sql`

- [ ] **Step 2: Write the migration SQL**

Create the migration file with the following content:

```sql
-- Add Sellsy declination tracking to product_variants
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS sellsy_declination_id INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- Mark ALL existing variants as manual and inactive
-- (they will be replaced by Sellsy-synced ones)
UPDATE product_variants
  SET source = 'manual', is_active = false
  WHERE source = 'manual';

-- Add unique constraint for Sellsy upsert conflict key
-- (nullable so manual rows don't conflict)
ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_sellsy_declination_id_key
  UNIQUE (sellsy_declination_id);

-- Add variant tracking to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_variant_id UUID
    REFERENCES product_variants(id) ON DELETE SET NULL;

-- Add index for variant lookups on orders
CREATE INDEX IF NOT EXISTS order_items_product_variant_id_idx
  ON order_items (product_variant_id);

-- Add helpful index for catalog queries filtering by source + active
CREATE INDEX IF NOT EXISTS product_variants_source_active_idx
  ON product_variants (product_id, source, is_active);
```

- [ ] **Step 3: Apply the migration via Supabase MCP**

Using the Supabase MCP tool `apply_migration`, apply the SQL from Step 2 to the project. The project ref can be found in `supabase/config.toml` (look for `project_id`).

After applying, verify with `execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'product_variants'
  AND column_name IN ('sellsy_declination_id', 'source', 'synced_at')
ORDER BY column_name;
```
Expected: 3 rows returned with correct types.

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'order_items'
  AND column_name = 'product_variant_id';
```
Expected: 1 row returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add sellsy_declination_id and source columns to product_variants, product_variant_id to order_items"
```

---

## Task 2: Exploratory Declination Probe + Sync Engine Rewrite

**Context:** Before writing normalization code, the sync engine must make a real API call to `GET /v2/items/{id}/declinations` and log the raw response. Item ID 126 is specified for the probe. Only after seeing the actual shape should normalization be written.

**Files:**
- Modify: `supabase/functions/sellsy-sync/index.ts`

- [ ] **Step 1: Read the current sync function**

Read `/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/pluralroaster/pluralroaster/supabase/functions/sellsy-sync/index.ts` in full.

- [ ] **Step 2: Add the declination fetch helper with probe logging**

After the existing `fetchSellsyProducts` function, add a new function `fetchDeclinationsForItem`. Include a `PROBE` flag that logs the raw response for item ID 126 only:

```typescript
// ── Declination fetching ──────────────────────────────────────────────────────

type RawDeclination = {
  id: number;
  item_id: number;
  reference: string | null;
  is_active: boolean;
  price?: {
    default_amount?: number | null;
    default_amount_taxes_inc?: number | null;
  } | null;
  values?: Array<{
    attribute_label?: string | null;
    value_label?: string | null;
  }> | null;
};

async function fetchDeclinationsForItem(
  accessToken: string,
  itemId: number,
): Promise<RawDeclination[]> {
  const url = `https://api.sellsy.com/v2/items/${itemId}/declinations`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error(`[declinations] item ${itemId} → HTTP ${resp.status}: ${body}`);
    return [];
  }

  const json = await resp.json();

  // PROBE: log the full raw response for item 126 so we can verify structure
  if (itemId === 126) {
    console.log("[PROBE] Raw /declinations response for item 126:", JSON.stringify(json, null, 2));
  }

  // Sellsy v2 lists come back as { data: [...], pagination: {...} }
  // or sometimes as a bare array — handle both
  const items: RawDeclination[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
    ? json.data
    : [];

  return items;
}
```

- [ ] **Step 3: Add the declination normalizer**

Add this function directly after `fetchDeclinationsForItem`. It converts a raw Sellsy declination into a row ready for Supabase upsert. Size weight parsing is done here to support intelligent sort ordering:

```typescript
/** Parse a size label like "250g", "1kg", "3kg" into grams for sort ordering. */
function parseSizeWeightGrams(label: string | null): number {
  if (!label) return 9999;
  const lower = label.toLowerCase().trim();
  const kgMatch = lower.match(/^(\d+(?:\.\d+)?)\s*kg/);
  if (kgMatch) return Math.round(parseFloat(kgMatch[1]) * 1000);
  const gMatch = lower.match(/^(\d+(?:\.\d+)?)\s*g/);
  if (gMatch) return Math.round(parseFloat(gMatch[1]));
  return 9999;
}

/** Convert grams to kg for size_kg column (e.g. 250 → 0.25, 1000 → 1). */
function gramsToKg(grams: number): number {
  return grams / 1000;
}

type VariantRow = {
  product_id: string;       // UUID from our products table
  sellsy_declination_id: number;
  size_label: string;
  size_kg: number;
  price: number;
  sku: string | null;
  is_active: boolean;
  source: "sellsy";
  synced_at: string;        // ISO timestamp
};

function normalizeDeclination(
  raw: RawDeclination,
  productId: string,           // UUID from our products table
): VariantRow | null {
  // Extract the first attribute value as the size label (e.g. "250g", "1kg")
  const sizeLabel = raw.values?.[0]?.value_label?.trim() ?? null;
  if (!sizeLabel) {
    // Declination without a size attribute — skip (will get default variant in Task 3)
    return null;
  }

  const priceHT = raw.price?.default_amount ?? 0;
  const weightGrams = parseSizeWeightGrams(sizeLabel);
  const sizeKg = gramsToKg(weightGrams);

  return {
    product_id: productId,
    sellsy_declination_id: raw.id,
    size_label: sizeLabel,
    size_kg: sizeKg,
    price: priceHT,
    sku: raw.reference ?? null,
    is_active: raw.is_active,
    source: "sellsy",
    synced_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Add the declination upsert function**

```typescript
async function syncDeclinationsToDatabase(
  db: ReturnType<typeof createClient>,
  rows: VariantRow[],
): Promise<{ synced: number; errors: string[] }> {
  if (rows.length === 0) return { synced: 0, errors: [] };

  const { error, count } = await db
    .from("product_variants")
    .upsert(rows, {
      onConflict: "sellsy_declination_id",
      count: "exact",
    });

  if (error) {
    return { synced: 0, errors: [error.message] };
  }

  return { synced: count ?? rows.length, errors: [] };
}
```

- [ ] **Step 5: Add the default variant function for items without declinations**

Items with no declinations (or declinations without size labels) need a single "Standard" fallback variant so they still appear in catalog:

```typescript
async function ensureDefaultVariant(
  db: ReturnType<typeof createClient>,
  productId: string,
  pricePerKg: number,
): Promise<void> {
  // Check if this product already has any Sellsy-sourced variants
  const { data } = await db
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("source", "sellsy")
    .limit(1);

  if (data && data.length > 0) return; // Already has Sellsy variants

  // Upsert a sentinel default variant using a deterministic sellsy_declination_id
  // We use 0 as a sentinel that means "no real declination" — won't collide with
  // real Sellsy IDs. One per product, keyed on (product_id, size_label).
  const { error } = await db.from("product_variants").upsert(
    {
      product_id: productId,
      sellsy_declination_id: null,   // null so UNIQUE constraint doesn't fire
      size_label: "Standard",
      size_kg: 1,
      price: pricePerKg,
      sku: null,
      is_active: true,
      source: "sellsy",
      synced_at: new Date().toISOString(),
    },
    {
      onConflict: "product_id,size_label",  // fallback key for the default variant
    },
  );

  if (error) {
    console.error(`[defaultVariant] product ${productId}:`, error.message);
  }
}
```

**Note:** The `onConflict: "product_id,size_label"` upsert requires a unique constraint on that pair — the existing `UNIQUE(product_id, size_label)` from the original migration already covers this.

- [ ] **Step 6: Rewrite `handleProductSync` to orchestrate declination sync**

Replace the existing `handleProductSync` function with a version that:
1. Fetches all Sellsy items (existing logic)
2. For each item: fetches declinations (with 150ms sleep between calls), normalizes, upserts
3. If no valid declinations, calls `ensureDefaultVariant`
4. Deactivates variants whose `sellsy_declination_id` is no longer in Sellsy

Find the existing `handleProductSync` function and replace it with:

```typescript
async function handleProductSync(
  user: { id: string },
  accessToken: string,
): Promise<void> {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const startedAt = new Date().toISOString();
  console.log("[sync] Starting product + declination sync");

  // ── 1. Fetch all Sellsy items ──────────────────────────────────────────────
  const rawProducts = await fetchSellsyProducts(accessToken);
  console.log(`[sync] Fetched ${rawProducts.length} items from Sellsy`);

  // ── 2. Normalize + upsert products ────────────────────────────────────────
  const productRows = rawProducts.map(normalizeProduct);
  await syncProductsToDatabase(productRows);

  // Fetch our product UUIDs keyed by sellsy_id (TEXT)
  const { data: dbProducts, error: dbErr } = await db
    .from("products")
    .select("id, sellsy_id, price_per_kg")
    .in("sellsy_id", productRows.map((p) => p.sellsy_id));

  if (dbErr || !dbProducts) {
    console.error("[sync] Failed to load product UUIDs:", dbErr?.message);
    throw new Error(dbErr?.message ?? "Failed to load products");
  }

  const productUuidBySellsyId = Object.fromEntries(
    dbProducts.map((p) => [p.sellsy_id, { uuid: p.id, pricePerKg: Number(p.price_per_kg) }]),
  );

  // ── 3. Fetch declinations per item + upsert variants ─────────────────────
  let totalVariantsSynced = 0;
  const allSeenDeclinationIds: number[] = [];
  const parseErrors: string[] = [];

  for (const raw of rawProducts) {
    const sellsyId = String(raw.id);
    const entry = productUuidBySellsyId[sellsyId];
    if (!entry) {
      console.warn(`[sync] No UUID found for sellsy_id=${sellsyId}, skipping declinations`);
      continue;
    }

    // Rate limit: 150ms between declination API calls
    await new Promise((r) => setTimeout(r, 150));

    const declinations = await fetchDeclinationsForItem(accessToken, raw.id);
    const variantRows: VariantRow[] = [];

    for (const dec of declinations) {
      const row = normalizeDeclination(dec, entry.uuid);
      if (!row) {
        parseErrors.push(`item ${raw.id} declination ${dec.id}: no size label`);
        continue;
      }
      variantRows.push(row);
      if (dec.id) allSeenDeclinationIds.push(dec.id);
    }

    const { synced, errors } = await syncDeclinationsToDatabase(db, variantRows);
    totalVariantsSynced += synced;
    parseErrors.push(...errors);

    // If no valid declinations, ensure a default "Standard" variant exists
    if (variantRows.length === 0) {
      await ensureDefaultVariant(db, entry.uuid, entry.pricePerKg);
    }
  }

  // ── 4. Deactivate variants no longer returned by Sellsy ──────────────────
  if (allSeenDeclinationIds.length > 0) {
    const { error: deactivateErr } = await db
      .from("product_variants")
      .update({ is_active: false })
      .eq("source", "sellsy")
      .not("sellsy_declination_id", "is", null)
      .not("sellsy_declination_id", "in", `(${allSeenDeclinationIds.join(",")})`);

    if (deactivateErr) {
      console.error("[sync] Deactivate stale variants:", deactivateErr.message);
    }
  }

  // ── 5. Log sync run ───────────────────────────────────────────────────────
  await db.from("sync_runs").insert({
    source: "sellsy",
    sync_type: "products",
    status: parseErrors.length > 0 ? "partial" : "success",
    synced_count: productRows.length,
    parse_errors: parseErrors.length > 0 ? parseErrors : null,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    created_by: user.id,
  });

  console.log(
    `[sync] Done. Products: ${productRows.length}, Variants synced: ${totalVariantsSynced}, Errors: ${parseErrors.length}`,
  );
}
```

- [ ] **Step 7: Deploy the updated Edge Function**

Using the Supabase MCP tool `deploy_edge_function`, deploy `sellsy-sync`:

```
function_name: sellsy-sync
entrypoint: supabase/functions/sellsy-sync/index.ts
```

- [ ] **Step 8: Trigger a sync and check the probe log**

From the Supabase dashboard (or using `execute_sql` to call the function), trigger a product sync. Then use the Supabase MCP `get_logs` tool (or Supabase dashboard Logs) to find the `[PROBE] Raw /declinations response for item 126` log line. Confirm the response structure matches `RawDeclination` type assumptions.

If the structure differs (e.g. price field is named differently, values array is nested differently), update `normalizeDeclination` accordingly before committing.

- [ ] **Step 9: Verify variants in DB**

```sql
-- Check that Sellsy-sourced variants were created
SELECT pv.source, pv.size_label, pv.size_kg, pv.price, pv.sellsy_declination_id, p.name
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.source = 'sellsy'
ORDER BY p.name, pv.size_kg
LIMIT 50;
```

Expected: rows with `source='sellsy'`, numeric `sellsy_declination_id`, correct size labels.

```sql
-- Manual variants should now be inactive
SELECT count(*) FROM product_variants WHERE source = 'manual' AND is_active = true;
```

Expected: 0.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/sellsy-sync/index.ts
git commit -m "feat: sync Sellsy declinations as product variants; probe logs raw API response for item 126"
```

---

## Task 3: Update `ProductVariant` Type + Catalog Filtering

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/pages/CatalogPage.tsx`

- [ ] **Step 1: Read current store types**

Read `/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/pluralroaster/pluralroaster/src/lib/store.ts` in full.

- [ ] **Step 2: Update `ProductVariant` interface**

Find the `ProductVariant` interface in `store.ts` and update it to add Sellsy fields:

```typescript
export type ProductVariant = {
  id: string;
  size_label: string;
  size_kg: number;
  price: number;
  sku: string | null;
  is_active: boolean;
  source: "sellsy" | "manual";
  sellsy_declination_id: number | null;
};
```

- [ ] **Step 3: Read CatalogPage**

Read `/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/pluralroaster/pluralroaster/src/pages/CatalogPage.tsx` in full.

- [ ] **Step 4: Add `source` filter to variant query in CatalogPage**

Find the variant query in `CatalogPage.tsx` (the `.from("product_variants").select(...)` call). Update it to filter `source = 'sellsy'` in addition to `is_active = true`:

Before:
```typescript
.from("product_variants")
.select("id, product_id, size_label, size_kg, price, sku, is_active")
.eq("is_active", true)
```

After:
```typescript
.from("product_variants")
.select("id, product_id, size_label, size_kg, price, sku, is_active, source, sellsy_declination_id")
.eq("is_active", true)
.eq("source", "sellsy")
.order("size_kg", { ascending: true })
```

Also update the mapped type to include the new fields:
```typescript
const mapped: ProductVariant = {
  id: v.id,
  size_label: v.size_label,
  size_kg: Number(v.size_kg),
  price: Number(v.price),
  sku: v.sku ?? null,
  is_active: v.is_active,
  source: v.source as "sellsy" | "manual",
  sellsy_declination_id: v.sellsy_declination_id ?? null,
};
```

- [ ] **Step 5: Build and verify no TypeScript errors**

```bash
cd /Users/saulsuaza/Documents/CLAUDE\ CODE\ PROJECTS/pluralroaster/pluralroaster
npm run build 2>&1 | head -60
```

Expected: build succeeds with no TypeScript errors related to `ProductVariant`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts src/pages/CatalogPage.tsx
git commit -m "feat: filter catalog to Sellsy-sourced variants only; extend ProductVariant type"
```

---

## Task 4: Replace `ProductVariantsEditor` with Read-Only Sellsy Panel

**Context:** The current `ProductVariantsEditor` allows manually creating variants (delete-all then insert). This must be replaced with a read-only panel that shows Sellsy-synced variants and informs the admin that variants are managed in Sellsy.

**Files:**
- Modify: `src/components/ProductVariantsEditor.tsx`

- [ ] **Step 1: Read current ProductVariantsEditor**

Read `/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/pluralroaster/pluralroaster/src/components/ProductVariantsEditor.tsx` in full.

- [ ] **Step 2: Rewrite the component**

Replace the entire file content with a read-only variant display:

```typescript
import { useState, useEffect } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

type Variant = {
  id: string;
  size_label: string;
  size_kg: number;
  price: number;
  sku: string | null;
  is_active: boolean;
  source: string;
  sellsy_declination_id: number | null;
};

interface ProductVariantsEditorProps {
  productId: string;
  productName: string;
  basePricePerKg: number;
}

export function ProductVariantsEditor({ productId }: ProductVariantsEditorProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .from("product_variants")
      .select("id, size_label, size_kg, price, sku, is_active, source, sellsy_declination_id")
      .eq("product_id", productId)
      .order("size_kg", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) {
          setVariants((data ?? []).map((v: any) => ({
            id: v.id,
            size_label: v.size_label,
            size_kg: Number(v.size_kg),
            price: Number(v.price),
            sku: v.sku ?? null,
            is_active: v.is_active,
            source: v.source ?? "manual",
            sellsy_declination_id: v.sellsy_declination_id ?? null,
          })));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading variants…
      </div>
    );
  }

  const sellsyVariants = variants.filter((v) => v.source === "sellsy" && v.is_active);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Bag Sizes & Pricing</p>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Managed in Sellsy
        </span>
      </div>

      {sellsyVariants.length > 0 ? (
        <div className="space-y-2">
          {sellsyVariants.map((variant) => (
            <div
              key={variant.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-2.5"
            >
              <div className="w-14 text-center">
                <span className="text-sm font-semibold text-foreground">{variant.size_label}</span>
              </div>
              <div className="flex-1 text-sm text-muted-foreground">
                <span className="tabular-nums font-medium text-foreground">€{variant.price.toFixed(2)}</span>
                {variant.sku && (
                  <span className="ml-2 font-mono text-[11px]">{variant.sku}</span>
                )}
              </div>
              <Badge variant="secondary" className="text-[10px]">
                Sellsy #{variant.sellsy_declination_id}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No Sellsy variants found. Run a product sync to import sizes from Sellsy.
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Variants are managed in Sellsy as Declinations. Run a product sync to refresh.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/saulsuaza/Documents/CLAUDE\ CODE\ PROJECTS/pluralroaster/pluralroaster
npm run build 2>&1 | head -60
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductVariantsEditor.tsx
git commit -m "feat: replace manual ProductVariantsEditor with read-only Sellsy variant panel"
```

---

## Task 5: Track `product_variant_id` in Order Creation

**Files:**
- Modify: `src/components/CreateOrderDialog.tsx`

- [ ] **Step 1: Read current CreateOrderDialog**

Read `/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/pluralroaster/pluralroaster/src/components/CreateOrderDialog.tsx` in full.

- [ ] **Step 2: Find where order_items are built**

Locate the code that constructs `order_items` rows to insert (look for `{ order_id, product_id, product_name, product_sku, quantity, price_per_kg }`).

The cart items should carry variant information — check `store.ts` for the cart item type. Look for `sizeLabel`, `sizeKg`, and `unitPrice` fields on cart items. If the cart item has a variant reference, we need to resolve the `product_variant_id`.

- [ ] **Step 3: Update order_items insertion to include product_variant_id**

The cart stores `sizeLabel` per item (key format: `productId::sizeLabel`). To get the `product_variant_id`, we need to look up the variant by `(product_id, size_label, source='sellsy')` at order creation time.

Add a variant lookup before inserting order items. In `CreateOrderDialog.tsx`, find the order creation logic and update it:

```typescript
// Before building order_items rows, fetch variant IDs for Sellsy variants
// Cart items that have a sizeLabel need their UUID looked up
const sellsyItems = cartItems.filter((item) => item.sizeLabel);
let variantIdMap: Record<string, string> = {}; // key: "productId::sizeLabel" → variant UUID

if (sellsyItems.length > 0) {
  const { data: variantRows } = await supabase
    .from("product_variants")
    .select("id, product_id, size_label")
    .eq("source", "sellsy")
    .eq("is_active", true)
    .in(
      "product_id",
      [...new Set(sellsyItems.map((i) => i.product.id))],
    );

  for (const v of variantRows ?? []) {
    variantIdMap[`${v.product_id}::${v.size_label}`] = v.id;
  }
}

// When building each order_item row:
const orderItemRows = cartItems.map((item) => {
  const variantKey = item.sizeLabel ? `${item.product.id}::${item.sizeLabel}` : null;
  const productVariantId = variantKey ? (variantIdMap[variantKey] ?? null) : null;

  return {
    order_id: newOrder.id,
    product_id: item.product.id,
    product_name: item.product.name,
    product_sku: item.sizeLabel ? (item.product.variants?.find(v => v.size_label === item.sizeLabel)?.sku ?? item.product.sku) : item.product.sku,
    quantity: item.quantity,
    price_per_kg: item.unitPrice ?? item.product.pricePerKg,
    product_variant_id: productVariantId,
  };
});
```

**Note:** The exact code depends on what you find in Step 1. The key change is adding `product_variant_id` to each `order_items` row. Adapt the lookup to match the actual cart item structure.

- [ ] **Step 4: Build and verify**

```bash
cd /Users/saulsuaza/Documents/CLAUDE\ CODE\ PROJECTS/pluralroaster/pluralroaster
npm run build 2>&1 | head -60
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/CreateOrderDialog.tsx
git commit -m "feat: track product_variant_id on order_items when creating orders"
```

---

## Task 6: Update Admin Sync Panel with Variant Count

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`

- [ ] **Step 1: Read AdminDashboard**

Read `/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/pluralroaster/pluralroaster/src/pages/AdminDashboard.tsx` in full.

- [ ] **Step 2: Add variant count to sync status display**

Find `loadLatestProductSync` (or equivalent) in `AdminDashboard.tsx`. After loading the sync run, also query for current product and variant counts:

```typescript
// After loading the sync run, fetch counts:
const [{ count: productCount }, { count: variantCount }] = await Promise.all([
  supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true),
  supabase
    .from("product_variants")
    .select("*", { count: "exact", head: true })
    .eq("source", "sellsy")
    .eq("is_active", true),
]);
```

Add state variables to hold these counts:
```typescript
const [productCount, setProductCount] = useState<number | null>(null);
const [variantCount, setVariantCount] = useState<number | null>(null);
```

- [ ] **Step 3: Display variant count in the sync status card**

In the admin sync card JSX, find where product count or sync status is displayed. Add the variant count alongside it:

```tsx
<div className="flex items-center gap-4 text-sm text-muted-foreground">
  {productCount !== null && (
    <span>{productCount} products</span>
  )}
  {variantCount !== null && (
    <span>· {variantCount} Sellsy variants</span>
  )}
</div>
```

The exact placement depends on the current JSX structure found in Step 1. Add it near the existing product count display, or after the last sync timestamp.

- [ ] **Step 4: Build and verify**

```bash
cd /Users/saulsuaza/Documents/CLAUDE\ CODE\ PROJECTS/pluralroaster/pluralroaster
npm run build 2>&1 | head -60
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminDashboard.tsx
git commit -m "feat: show Sellsy variant count in admin sync status panel"
```

---

## Spec Self-Review

### Spec Coverage Check

| Spec Requirement | Covered By |
|---|---|
| Pull ALL data from Sellsy API v2, including Declinations | Task 2 — `fetchDeclinationsForItem` + sync loop |
| Sellsy = SINGLE SOURCE OF TRUTH | Task 1 migration marks manual variants inactive; Task 3 filters catalog to `source='sellsy'` |
| Manually created variants hidden | Task 1 migration sets `is_active=false` for all `source='manual'` rows |
| Items without declinations get "Standard" default variant | Task 2 — `ensureDefaultVariant` |
| Exploratory API call logged before normalization code | Task 2 — `[PROBE]` log for item 126 |
| DB schema: `sellsy_declination_id`, `source`, `synced_at` on variants | Task 1 migration |
| DB schema: `product_variant_id` on `order_items` | Task 1 migration |
| Admin sync controls show variant count | Task 6 |
| Sort variants by weight | Task 2 — `parseSizeWeightGrams` + `order("size_kg")` in Task 3 catalog query |
| Replace manual variant editor | Task 4 — read-only Sellsy panel |
| Track variant on order creation | Task 5 |
| Deactivate removed Sellsy variants | Task 2 — Step 6, deactivation block |

### Placeholder Scan

No TBD, TODO, or incomplete sections found. All steps contain exact code or explicit instructions to read then adapt.

### Type Consistency

- `ProductVariant` in `store.ts` (Task 3) matches the fields selected in `CatalogPage.tsx` (Task 3) and displayed in `ProductVariantsEditor.tsx` (Task 4) ✓
- `VariantRow` type (Task 2) maps to the `product_variants` columns added in Task 1 migration ✓
- `product_variant_id` column added in Task 1 matches what Task 5 inserts ✓

### Potential Issues to Watch

1. **`ensureDefaultVariant` conflict key**: uses `onConflict: "product_id,size_label"` — requires that the existing `UNIQUE(product_id, size_label)` constraint from the original `product_variants` migration is still in place. Verified from migration file `20260329134849_...sql`.

2. **`sellsy_id` is TEXT**: the existing `products.sellsy_id` column is `TEXT`. The code uses `parseInt(raw.id, 10)` for API calls and `String(raw.id)` for DB keys. Task 2 Step 6 uses `productUuidBySellsyId[String(raw.id)]` consistently.

3. **Probe log timing**: The probe in `fetchDeclinationsForItem` runs during the real sync — it only fires for `itemId === 126`. If item 126 doesn't exist in the roaster's Sellsy catalog, the probe will never fire. Consider using the first item's ID as a fallback in that case, or make the probe log for ALL items (remove the `if (itemId === 126)` guard) and just inspect the first entry in logs.
