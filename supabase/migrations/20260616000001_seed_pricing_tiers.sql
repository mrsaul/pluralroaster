-- Seed the 3 standard pricing tiers.
-- Admin can rename/adjust these at any time via the PricingTiersView UI.
INSERT INTO public.pricing_tiers (name, product_discount_percent, delivery_discount_percent)
VALUES
  ('Bronze', 5,  0),
  ('Argent', 10, 0),
  ('Or',     15, 0);
