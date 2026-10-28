-- Coffee (non-kitchen) security hardening, from the Supabase security advisor.
-- Safe to run more than once.
--
-- 1. create_order_with_items: a caller could create an order for any user_id.
--    Now only for yourself, unless you are admin.
-- 2. update_stock_with_history: anyone could change stock. Now admin/roaster only
--    (same rule as the roasted_stock RLS policies), and the history row records
--    the real caller.
-- 3. Trigger functions are not meant to be called over the API: revoke EXECUTE.
--    (Triggers keep firing: EXECUTE is only checked when the trigger is created.)
-- 4. Fix mutable search_path on the three trigger functions.
-- 5. Functions that require a signed-in user: revoke EXECUTE from anon/public.
--
-- Left as is on purpose: has_role() and get_my_company_id() stay executable by
-- anon because RLS policies on companies/contacts/shopify_orders/sync_health_logs
-- are written "to public" and call them; revoking would turn empty results into
-- permission errors for logged-out requests.

-- ── 1. create_order_with_items (current 12-arg version) ─────────────────────
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_user_id uuid, p_delivery_date date, p_total_kg numeric, p_total_price numeric,
  p_status text, p_confirmed_at timestamp with time zone, p_notes text, p_items jsonb,
  p_reordered_from uuid DEFAULT NULL::uuid, p_delivery_address_id uuid DEFAULT NULL::uuid,
  p_discount_percent numeric DEFAULT 0, p_pricing_tier_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID;
  v_item     JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized to create an order for another user' USING ERRCODE = '42501';
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.create_order_with_items(uuid, date, numeric, numeric, text, timestamp with time zone, text, jsonb, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, date, numeric, numeric, text, timestamp with time zone, text, jsonb, uuid, uuid, numeric, text) TO authenticated, service_role;

-- Old 8-arg overload: exists only in production (not in migrations), unused by the
-- app, and has no checks at all. Nobody but service_role may call it.
DO $$
BEGIN
  IF to_regprocedure('public.create_order_with_items(uuid,date,numeric,numeric,text,timestamp with time zone,text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_order_with_items(uuid,date,numeric,numeric,text,timestamp with time zone,text,jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid,date,numeric,numeric,text,timestamp with time zone,text,jsonb) TO service_role';
  END IF;
END $$;

-- ── 2. update_stock_with_history ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_stock_with_history(
  p_stock_id uuid, p_new_qty numeric, p_new_threshold numeric, p_note text, p_updated_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev_qty numeric;
  v_actor    uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_actor, 'admin'::public.app_role)
          OR public.has_role(v_actor, 'roaster'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to update stock' USING ERRCODE = '42501';
  END IF;

  SELECT quantity_kg INTO v_prev_qty
  FROM roasted_stock
  WHERE id = p_stock_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock record not found';
  END IF;

  -- p_updated_by is kept for API compatibility; the real caller is recorded.
  INSERT INTO roasted_stock_history (
    stock_id, previous_quantity_kg, new_quantity_kg, delta_kg,
    change_type, note, updated_by
  ) VALUES (
    p_stock_id, v_prev_qty, p_new_qty, p_new_qty - v_prev_qty,
    'manual_update', p_note, v_actor
  );

  UPDATE roasted_stock
  SET
    quantity_kg            = p_new_qty,
    low_stock_threshold_kg = p_new_threshold,
    last_updated_by        = v_actor,
    last_updated_at        = now()
  WHERE id = p_stock_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_stock_with_history(uuid, numeric, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_stock_with_history(uuid, numeric, numeric, text, uuid) TO authenticated, service_role;

-- ── 3 & 4. Trigger functions ────────────────────────────────────────────────
ALTER FUNCTION public.decrease_stock_on_delivery() SET search_path = public;
ALTER FUNCTION public.create_stock_row_on_new_product() SET search_path = public;

REVOKE ALL ON FUNCTION public.decrease_stock_on_delivery() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_stock_row_on_new_product() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- set_default_sku exists only in production (not in migrations).
DO $$
BEGIN
  IF to_regprocedure('public.set_default_sku()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.set_default_sku() SET search_path = public';
    EXECUTE 'REVOKE ALL ON FUNCTION public.set_default_sku() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ── 5. Signed-in-only functions: no anon ────────────────────────────────────
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('ensure_current_user_role', 'update_company_contact',
                        'update_company_info', 'update_company_name',
                        'user_save_onboarding_progress', 'user_update_own_onboarding')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
