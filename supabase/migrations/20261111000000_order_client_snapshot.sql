-- Admin client receipt: store a frozen copy of the order summary the client saw
-- (orders.client_snapshot) so admin can compare it later (RPC v6).
--
-- p_client_snapshot = { "totalHT": number, ... } (opaque jsonb, written once).
-- The RPC stamps orderId (the new order's id as text), placedAt (server time),
-- source = "client", and, when totalHT differs from p_total_price by more than
-- 0.01, "mismatch": true (a client-sent mismatch is ignored).
-- client_snapshot is write-once: only an INSERT (via the RPC, or by an admin)
-- can set it (direct INSERTs by service role, which has no auth.uid(), are
-- nulled too); any later UPDATE that changes it raises, for every role.
-- The legacy 8-arg overload is left untouched.
-- A malformed p_client_snapshot (non-object, or totalHT not a number) never
-- blocks the order: it is stored with "mismatch": true (non-objects wrapped
-- under "raw").


ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_snapshot jsonb;

DROP FUNCTION IF EXISTS public.create_order_with_items(
  uuid, date, numeric, numeric, text, timestamptz, text, jsonb,
  uuid, uuid, numeric, text, jsonb
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
  p_client_snapshot jsonb DEFAULT NULL::jsonb
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
    client_snapshot
  ) VALUES (
    v_order_id, p_user_id, p_delivery_date, p_total_kg, p_total_price,
    p_status, p_confirmed_at, p_notes, p_discount_percent, p_pricing_tier_name,
    v_snapshot
  );

  PERFORM set_config('plural.snapshot_rpc', 'off', true);

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

-- Same grants as the 13-arg version: postgres, authenticated, service_role.
-- anon must be revoked explicitly: Supabase default privileges grant it directly.
REVOKE ALL ON FUNCTION public.create_order_with_items(
  uuid, date, numeric, numeric, text, timestamptz, text, jsonb,
  uuid, uuid, numeric, text, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, date, numeric, numeric, text, timestamptz, text, jsonb,
  uuid, uuid, numeric, text, jsonb, jsonb
) TO authenticated, service_role;


-- Write-once guard. INSERT: a non-admin caller outside the RPC cannot set the
-- snapshot (it is silently nulled). UPDATE: any change to client_snapshot
-- raises, for every role; updates that leave it untouched pass through.
-- DELETE is not covered by this trigger.
-- NULL -> value on UPDATE is blocked on purpose: copies only come from the RPC
-- or an admin INSERT, so orders from old app versions never get one later.
-- Note: plural.snapshot_rpc can be set by anyone with raw SQL access;
-- PostgREST callers cannot set it and run an insert in the same transaction.
CREATE OR REPLACE FUNCTION public.orders_client_snapshot_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.client_snapshot IS NOT NULL
       AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
       AND current_setting('plural.snapshot_rpc', true) IS DISTINCT FROM 'on' THEN
      NEW.client_snapshot := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.client_snapshot IS DISTINCT FROM OLD.client_snapshot THEN
      RAISE EXCEPTION 'client_snapshot is write-once';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_client_snapshot_guard ON public.orders;
CREATE TRIGGER orders_client_snapshot_guard
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_client_snapshot_guard();


-- Verification (run manually after applying; used in Task 6):
-- 1. select pg_get_function_identity_arguments(oid) from pg_proc
--      where proname = 'create_order_with_items';
--    -- expect exactly 2 rows: legacy 8-arg and new 14-arg (13-arg gone)
-- 2. select column_name from information_schema.columns
--      where table_name = 'orders' and column_name = 'client_snapshot';
--    -- expect 1 row
-- 3. select has_function_privilege('anon',
--      'public.create_order_with_items(uuid,date,numeric,numeric,text,timestamptz,text,jsonb,uuid,uuid,numeric,text,jsonb,jsonb)',
--      'EXECUTE');
--    -- expect false
-- 4-7. Inside BEGIN; ... ROLLBACK; as the SAUL TEST user:
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<SAUL TEST user id>","role":"authenticated"}';
--      -- 4. call the RPC without p_client_snapshot; the order row has client_snapshot IS NULL
--      -- 5. call the RPC with p_client_snapshot => '{"totalHT": <p_total_price + 1>}'::jsonb;
--      --    stored snapshot has mismatch = true and orderId = the new order id (text)
--      -- 6. update orders set is_packed = true where id = <that id>;   -- succeeds
--      --    update orders set client_snapshot = '{}' where id = <that id>;
--      --    -- raises: client_snapshot is write-once
--      -- 7. direct insert into orders (..., client_snapshot) values (..., '{"x":1}')
--      --    as the client -> stored client_snapshot IS NULL
--      -- 8. call the RPC with p_client_snapshot => '"oops"'::jsonb, then again with
--      --    '{"totalHT": "abc"}'::jsonb; both orders are placed, and the stored
--      --    snapshot has mismatch = true (first one wrapped under "raw")
--      -- 9. admin path: as an ADMIN user (claims sub = an admin user id), a direct
--      --    insert into orders (id, user_id, ..., client_snapshot)
--      --    values (..., '{"version":1,"source":"admin"}') keeps client_snapshot
--      --    NOT NULL (if it comes back NULL, has_role(auth.uid(),'admin') is false
--      --    for that session and admin manual orders lose their copy)
--      rollback;
