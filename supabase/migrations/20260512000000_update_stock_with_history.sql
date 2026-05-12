-- Atomic stock update with audit history.
-- Called from stock.ts:updateStock() via supabase.rpc("update_stock_with_history").
-- Updates roasted_stock quantity/threshold and writes a roasted_stock_history row in one transaction.
--
-- NOTE: this function was deployed directly on 2026-05-12 to fix a missing-function error
-- (migration 20260422000000_atomic_operations.sql existed in the repo but was never applied).

CREATE OR REPLACE FUNCTION public.update_stock_with_history(
  p_stock_id        uuid,
  p_new_qty         numeric,
  p_new_threshold   numeric,
  p_note            text,
  p_updated_by      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_qty numeric;
BEGIN
  SELECT quantity_kg INTO v_prev_qty
  FROM roasted_stock
  WHERE id = p_stock_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock record not found';
  END IF;

  INSERT INTO roasted_stock_history (
    stock_id,
    previous_quantity_kg,
    new_quantity_kg,
    delta_kg,
    change_type,
    note,
    updated_by
  ) VALUES (
    p_stock_id,
    v_prev_qty,
    p_new_qty,
    p_new_qty - v_prev_qty,
    'manual_update',
    p_note,
    p_updated_by
  );

  UPDATE roasted_stock
  SET
    quantity_kg            = p_new_qty,
    low_stock_threshold_kg = p_new_threshold,
    last_updated_by        = p_updated_by,
    last_updated_at        = now()
  WHERE id = p_stock_id;
END;
$$;
