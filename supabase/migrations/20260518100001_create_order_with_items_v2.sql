-- Drop the old JSONB-signature overload (the one defined in 20260422000000)
DROP FUNCTION IF EXISTS public.create_order_with_items(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_user_id        UUID,
  p_delivery_date  DATE,
  p_total_kg       NUMERIC,
  p_total_price    NUMERIC,
  p_status         TEXT,
  p_confirmed_at   TIMESTAMPTZ,
  p_notes          TEXT,
  p_items          JSONB,
  p_reordered_from UUID DEFAULT NULL
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
  -- NOTE: p_reordered_from is accepted but not persisted — no reordered_from
  -- column exists on orders yet. Add a migration to ALTER TABLE orders ADD COLUMN
  -- reordered_from UUID before using this parameter.
  INSERT INTO orders (
    user_id, delivery_date, total_kg, total_price,
    status, confirmed_at, notes
  ) VALUES (
    p_user_id, p_delivery_date, p_total_kg, p_total_price,
    p_status, p_confirmed_at, p_notes
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
