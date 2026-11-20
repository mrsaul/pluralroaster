-- Tier rules: each pricing tier gets a kg rate, a bag rate and an optional
-- volume step; each order stores the rule set used (orders.pricing_rules) and
-- each coffee order line the rate it was charged (order_items.line_discount_percent,
-- an existing column, so far used only by the delivery service row). RPC v7.
--
-- Existing tiers price exactly as today: kg = bag = product_discount_percent,
-- no step. Old orders (no pricing_rules, null line_discount_percent on coffee
-- rows) keep pricing from orders.discount_percent. Delivery is never discounted
-- by the tier. product_discount_percent is kept (legacy readers).

ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS kg_discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bag_discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume_threshold_kg numeric,
  ADD COLUMN IF NOT EXISTS volume_kg_discount_percent numeric;

-- Backfill (kg = bag = today's single rate). Safe to re-run only before tiers
-- are edited with the new columns.
UPDATE public.pricing_tiers
   SET kg_discount_percent = product_discount_percent,
       bag_discount_percent = product_discount_percent;

ALTER TABLE public.pricing_tiers
  DROP CONSTRAINT IF EXISTS pricing_tiers_tier_rules_check;
ALTER TABLE public.pricing_tiers
  ADD CONSTRAINT pricing_tiers_tier_rules_check CHECK (
    kg_discount_percent BETWEEN 0 AND 100
    AND bag_discount_percent BETWEEN 0 AND 100
    AND ((volume_threshold_kg IS NULL) = (volume_kg_discount_percent IS NULL))
    AND (volume_threshold_kg IS NULL OR volume_threshold_kg > 0)
    AND (volume_kg_discount_percent IS NULL OR volume_kg_discount_percent BETWEEN 0 AND 100)
  );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pricing_rules jsonb;

DROP FUNCTION IF EXISTS public.create_order_with_items(
  uuid, date, numeric, numeric, text, timestamptz, text, jsonb,
  uuid, uuid, numeric, text, jsonb, jsonb
);

CREATE FUNCTION public.create_order_with_items(
  p_user_id uuid,
  p_delivery_date date,
  p_total_kg numeric,
  p_total_price numeric,
  p_status text,
  p_confirmed_at timestamp with time zone,
  p_notes text,
  p_items jsonb,
  p_reordered_from uuid DEFAULT NULL::uuid,
  p_delivery_address_id uuid DEFAULT NULL::uuid,
  p_discount_percent numeric DEFAULT 0,
  p_pricing_tier_name text DEFAULT NULL::text,
  p_delivery jsonb DEFAULT NULL::jsonb,
  p_client_snapshot jsonb DEFAULT NULL::jsonb,
  p_pricing_rules jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id    UUID;
  v_item        JSONB;
  v_loberz_id   UUID;
  v_snapshot    JSONB;
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

  IF p_delivery IS NOT NULL THEN
    SELECT id INTO v_loberz_id FROM products WHERE sku = '0001' LIMIT 1;
    IF v_loberz_id IS NULL THEN
      RAISE EXCEPTION 'Delivery product (sku 0001) not found';
    END IF;
  END IF;

  v_order_id := gen_random_uuid();

  -- The snapshot is a best-effort copy: a malformed one must never block the
  -- order. Non-object snapshots are wrapped; the totalHT cast only runs on a
  -- JSON number.
  IF p_client_snapshot IS NULL THEN
    v_snapshot := NULL;
  ELSIF jsonb_typeof(p_client_snapshot) <> 'object' THEN
    v_snapshot := jsonb_build_object(
      'raw', p_client_snapshot,
      'orderId', v_order_id::text,
      'mismatch', true
    );
  ELSE
    -- Server-owned keys: orderId, placedAt (server clock, ISO string), source
    -- ("client": the RPC is the client path; admin copies are direct INSERTs)
    -- and mismatch (only ever set from the computed result below; any
    -- client-sent value is dropped first). '-' and '||' run on an object here.
    v_snapshot := (p_client_snapshot - 'mismatch') || jsonb_build_object(
      'orderId', v_order_id::text,
      'placedAt', to_jsonb(now()),
      'source', 'client'
    );
    IF jsonb_typeof(p_client_snapshot->'totalHT') IS DISTINCT FROM 'number'
       OR p_total_price IS NULL THEN
      v_snapshot := v_snapshot || '{"mismatch": true}'::jsonb;
    ELSIF abs((p_client_snapshot->>'totalHT')::numeric - p_total_price) > 0.01 THEN
      v_snapshot := v_snapshot || '{"mismatch": true}'::jsonb;
    END IF;
  END IF;

  -- Tell orders_client_snapshot_guard this INSERT comes from the RPC
  -- (transaction-local), then clear the flag right after the insert.
  PERFORM set_config('plural.snapshot_rpc', 'on', true);

  INSERT INTO orders (
    id, user_id, delivery_date, total_kg, total_price,
    status, confirmed_at, notes, discount_percent, pricing_tier_name,
    client_snapshot, pricing_rules
  ) VALUES (
    v_order_id, p_user_id, p_delivery_date, p_total_kg, p_total_price,
    p_status, p_confirmed_at, p_notes, p_discount_percent, p_pricing_tier_name,
    v_snapshot, p_pricing_rules
  );

  PERFORM set_config('plural.snapshot_rpc', 'off', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, product_id, product_name, product_sku,
      price_per_kg, quantity, size_label, size_kg, kind, line_discount_percent
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'product_name')::TEXT,
      (v_item->>'product_sku')::TEXT,
      (v_item->>'price_per_kg')::NUMERIC,
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'size_label')::TEXT,
      (v_item->>'size_kg')::NUMERIC,
      COALESCE(v_item->>'kind', 'coffee'),
      (v_item->>'line_discount_percent')::NUMERIC
    );
  END LOOP;

  IF p_delivery IS NOT NULL THEN
    INSERT INTO order_items (
      order_id, product_id, product_name, product_sku,
      price_per_kg, quantity, kind, list_price, line_discount_percent
    ) VALUES (
      v_order_id,
      v_loberz_id,
      'Livraison à vélo Loberz',
      '0001',
      (p_delivery->>'net')::NUMERIC,
      1,
      'service',
      (p_delivery->>'full_price')::NUMERIC,
      (p_delivery->>'discount_percent')::NUMERIC
    );
  END IF;

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$function$;

-- Same grants as the 14-arg version: postgres, authenticated, service_role.
-- anon must be revoked explicitly: Supabase default privileges grant it directly.
REVOKE ALL ON FUNCTION public.create_order_with_items(
  uuid, date, numeric, numeric, text, timestamptz, text, jsonb,
  uuid, uuid, numeric, text, jsonb, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, date, numeric, numeric, text, timestamptz, text, jsonb,
  uuid, uuid, numeric, text, jsonb, jsonb, jsonb
) TO authenticated, service_role;

-- orders_client_snapshot_guard (write-once trigger) is unchanged.

-- Verification (run manually after applying):
-- 1. select pg_get_function_identity_arguments(oid) from pg_proc
--      where proname = 'create_order_with_items';
--    -- expect exactly 2 rows: legacy 8-arg and new 15-arg (14-arg gone)
-- 2. select column_name from information_schema.columns
--      where (table_name = 'pricing_tiers' and column_name in
--        ('kg_discount_percent','bag_discount_percent','volume_threshold_kg','volume_kg_discount_percent'))
--         or (table_name = 'orders' and column_name = 'pricing_rules');
--    -- expect 5 rows
-- 3. select count(*) from pricing_tiers
--      where kg_discount_percent <> product_discount_percent
--         or bag_discount_percent <> product_discount_percent
--         or volume_threshold_kg is not null;
--    -- expect 0
-- 4. select has_function_privilege('anon',
--      'public.create_order_with_items(uuid,date,numeric,numeric,text,timestamptz,text,jsonb,uuid,uuid,numeric,text,jsonb,jsonb,jsonb)',
--      'EXECUTE');
--    -- expect false
-- 5. As the SAUL TEST user:
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<SAUL TEST user id>","role":"authenticated"}';
--      select create_order_with_items(
--        p_user_id => '<SAUL TEST user id>', p_delivery_date => current_date + 3,
--        p_total_kg => 2, p_total_price => 30, p_status => 'received',
--        p_confirmed_at => null, p_notes => null,
--        p_items => '[{"product_id":"<a coffee product id>","product_name":"t","product_sku":"t","price_per_kg":20,"quantity":2,"size_label":"1kg","size_kg":1,"line_discount_percent":25}]'::jsonb,
--        p_pricing_rules => '{"kg":25,"bag":10}'::jsonb);
--      -- then: orders.pricing_rules = {"kg":25,"bag":10}; the coffee order_items row has
--      -- line_discount_percent = 25; a call without p_pricing_rules / line_discount_percent
--      -- stores NULL for both
--      rollback;
