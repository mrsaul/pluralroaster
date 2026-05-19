-- 1a. products.kind — distinguishes coffee items from service items
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'coffee'
    CHECK (kind IN ('coffee', 'service'));

-- Seed: mark the LOBERZ delivery service by its Sellsy reference SKU.
-- The next Sellsy sync will also set this via normalizeProduct.
UPDATE public.products SET kind = 'service' WHERE sku = '0001';

-- 1b. order_items.kind — mirrors product kind at snapshot time so queries
--     never need to join products just to filter service lines
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'coffee'
    CHECK (kind IN ('coffee', 'service'));

-- 1c. Per-client delivery override (NULL = use Sellsy reference price;
--     0 = free delivery for this client; N = override in cents)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS delivery_fee_override_cents INTEGER;
