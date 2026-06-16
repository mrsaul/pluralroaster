-- Add unique constraint on pricing_tiers.name to prevent duplicate tier names.
ALTER TABLE public.pricing_tiers ADD CONSTRAINT pricing_tiers_name_key UNIQUE (name);
