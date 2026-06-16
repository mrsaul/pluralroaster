-- Add input validation guard to p_discount_percent.
-- Using CREATE OR REPLACE since the signature is unchanged from v4.
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
  IF p_discount_percent < 0 OR p_discount_percent > 100 THEN
    RAISE EXCEPTION 'p_discount_percent must be between 0 and 100, got %', p_discount_percent;
  END IF;

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
