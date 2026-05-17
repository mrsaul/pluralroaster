-- Add grind_type to order_items for structured packaging instructions.
-- The packer needs to know whether to grind and at what setting per line item.
-- Values align with the physical grind settings available in the roastery.
--
-- Nullable: NULL means "not specified" — UI will attempt to infer from
-- product name and display a warning badge to the packer.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS grind_type TEXT
    CHECK (grind_type IN ('whole_bean', 'espresso', 'filter', 'french_press', 'custom'));

COMMENT ON COLUMN public.order_items.grind_type IS
  'Grind setting for this line item. NULL = not specified (whole bean assumed, inferred from product name in UI). One of: whole_bean, espresso, filter, french_press, custom.';
