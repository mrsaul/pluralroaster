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
