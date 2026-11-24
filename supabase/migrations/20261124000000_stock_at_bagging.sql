-- Stock leaves when an order is bagged, not when it is delivered.
-- Design: docs/superpowers/specs/2026-11-24-stock-green-coffee-design.md (sections 1–5).
--
-- 1. orders.stock_deducted_at: set when the order's coffee left roasted stock,
--    cleared when it was put back. Owned by the trigger (writes from callers
--    on UPDATE are ignored), so a stale or hand-written value can never cause a
--    second deduction.
-- 2. products.green_percent + roasting_settings.default_green_percent: green
--    coffee to weigh = roasted × (1 + % / 100). Null on a product = default.
-- 3. roasted_stock_history.change_type gains order_packed / order_unpacked / roasted.
-- 4. Trigger: BEFORE UPDATE on orders deducts on bagging / restores on unbagging
--    and sets NEW.stock_deducted_at itself (no second UPDATE, so no recursion).
--    BEFORE DELETE restores, except for delivered orders (history.order_id is
--    ON DELETE SET NULL, so an AFTER trigger could no longer find this order's rows).
--    Replaces trg_decrease_stock_on_delivery / decrease_stock_on_delivery().
-- 5. RPCs: add_roasted_stock, set_green_percent, set_default_green_percent
--    (admin or roaster, same check as update_stock_with_history).
-- 6. Switch-over: delivered orders are marked deducted without touching stock
--    (the old trigger already subtracted them); open bagged orders are deducted
--    once through the new trigger.

-- ── 1. Columns and settings ─────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS green_percent numeric NULL
    CONSTRAINT products_green_percent_range CHECK (green_percent BETWEEN 0 AND 50);

CREATE TABLE IF NOT EXISTS public.roasting_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_green_percent numeric NOT NULL DEFAULT 15
    CHECK (default_green_percent BETWEEN 0 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.profiles(id)
);

INSERT INTO public.roasting_settings (id, default_green_percent)
VALUES (true, 15)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.roasting_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roasting_settings_select_admin_roaster" ON public.roasting_settings;
CREATE POLICY "roasting_settings_select_admin_roaster" ON public.roasting_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'roaster'::public.app_role)
  );

DROP POLICY IF EXISTS "roasting_settings_update_admin_roaster" ON public.roasting_settings;
CREATE POLICY "roasting_settings_update_admin_roaster" ON public.roasting_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'roaster'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'roaster'::public.app_role)
  );

-- ── 2. History change types ─────────────────────────────────────────────────
-- The original check was created inline (unnamed in the repo): find it by its
-- definition and replace it with a named one.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.roasted_stock_history'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%change_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.roasted_stock_history DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.roasted_stock_history
  ADD CONSTRAINT roasted_stock_history_change_type_check CHECK (
    change_type IN ('manual_update', 'order_delivered', 'order_packed', 'order_unpacked', 'roasted')
  );

-- ── 3. Stock movement functions ─────────────────────────────────────────────
-- An order is bagged (its coffee is off the shelf) when the "Conditionné" box is
-- ticked, or when it is ready for delivery or delivered.
CREATE OR REPLACE FUNCTION public.order_is_bagged(p_status text, p_is_packed boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(p_is_packed, false)
      OR coalesce(p_status IN ('ready_for_delivery', 'delivered'), false)
$$;

-- Take an order's coffee out of roasted stock. Per product, clamped at 0; the
-- history row records the delta actually applied (0 when stock was already 0).
-- Service lines and products without a stock row are skipped.
CREATE OR REPLACE FUNCTION public.deduct_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          record;
  v_stock_id uuid;
  v_prev     numeric;
  v_new      numeric;
BEGIN
  FOR r IN
    SELECT oi.product_id, sum(oi.quantity) AS total_kg
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
      AND oi.kind <> 'service'
      AND p.kind <> 'service'
    GROUP BY oi.product_id
    ORDER BY oi.product_id  -- stable lock order across concurrent orders
  LOOP
    SELECT id, quantity_kg INTO v_stock_id, v_prev
    FROM roasted_stock
    WHERE product_id = r.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_new := round(greatest(v_prev - r.total_kg, 0), 2);

    UPDATE roasted_stock
    SET quantity_kg     = v_new,
        last_updated_by = NULL,
        last_updated_at = now()
    WHERE id = v_stock_id;

    INSERT INTO roasted_stock_history (
      stock_id, previous_quantity_kg, new_quantity_kg, delta_kg,
      change_type, order_id, note, updated_by
    ) VALUES (
      v_stock_id, v_prev, v_new, v_new - v_prev,
      'order_packed', p_order_id, 'Auto-decreased on order bagging', NULL
    );
  END LOOP;
END;
$$;

-- Put back exactly what this order still has out of stock: per stock row, the
-- net of its order_packed, order_unpacked and order_delivered history rows
-- (recorded deltas, not order quantities, so the clamp never inflates stock).
-- order_delivered covers orders delivered under the old rule and moved back:
-- they get their delivered kilos back once (old rows recorded the unclamped
-- quantity).
CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      record;
  v_prev numeric;
BEGIN
  FOR r IN
    SELECT h.stock_id, sum(h.delta_kg) AS net
    FROM roasted_stock_history h
    WHERE h.order_id = p_order_id
      AND h.change_type IN ('order_packed', 'order_unpacked', 'order_delivered')
    GROUP BY h.stock_id
    HAVING sum(h.delta_kg) < 0
    ORDER BY h.stock_id
  LOOP
    SELECT quantity_kg INTO v_prev
    FROM roasted_stock
    WHERE id = r.stock_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE roasted_stock
    SET quantity_kg     = v_prev - r.net,
        last_updated_by = NULL,
        last_updated_at = now()
    WHERE id = r.stock_id;

    INSERT INTO roasted_stock_history (
      stock_id, previous_quantity_kg, new_quantity_kg, delta_kg,
      change_type, order_id, note, updated_by
    ) VALUES (
      r.stock_id, v_prev, v_prev - r.net, -r.net,
      'order_unpacked', p_order_id, 'Auto-restored on order unbagging', NULL
    );
  END LOOP;
END;
$$;

-- BEFORE UPDATE / BEFORE DELETE on orders.
CREATE OR REPLACE FUNCTION public.orders_stock_on_bagging()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- A delivered order's coffee has left the roastery: deleting it gives nothing back.
    IF OLD.stock_deducted_at IS NOT NULL AND OLD.status IS DISTINCT FROM 'delivered' THEN
      PERFORM public.restore_order_stock(OLD.id);
    END IF;
    RETURN OLD;
  END IF;

  -- The column belongs to this trigger: ignore what the caller wrote.
  NEW.stock_deducted_at := OLD.stock_deducted_at;

  IF public.order_is_bagged(NEW.status, NEW.is_packed) THEN
    IF OLD.stock_deducted_at IS NULL THEN
      PERFORM public.deduct_order_stock(NEW.id);
      NEW.stock_deducted_at := now();
    END IF;
  ELSIF OLD.stock_deducted_at IS NOT NULL THEN
    PERFORM public.restore_order_stock(NEW.id);
    NEW.stock_deducted_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Internal only: not callable over the API.
REVOKE ALL ON FUNCTION public.order_is_bagged(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_order_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_order_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_stock_on_bagging() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_is_bagged(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_order_stock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(uuid) TO service_role;

-- ── 4. RPCs ─────────────────────────────────────────────────────────────────
-- "Torréfié": add what came out of the roaster. Returns the new quantity.
CREATE OR REPLACE FUNCTION public.add_roasted_stock(
  p_product_id uuid, p_kg numeric, p_note text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_stock_id uuid;
  v_prev     numeric;
  v_new      numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_actor, 'admin'::public.app_role)
          OR public.has_role(v_actor, 'roaster'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to update stock' USING ERRCODE = '42501';
  END IF;

  IF p_kg IS NULL OR p_kg <= 0 THEN
    RAISE EXCEPTION 'p_kg must be greater than 0, got %', p_kg USING ERRCODE = '22023';
  END IF;

  INSERT INTO roasted_stock (product_id, quantity_kg, low_stock_threshold_kg)
  VALUES (p_product_id, 0, 5)
  ON CONFLICT (product_id) DO NOTHING;

  SELECT id, quantity_kg INTO v_stock_id, v_prev
  FROM roasted_stock
  WHERE product_id = p_product_id
  FOR UPDATE;

  UPDATE roasted_stock
  SET quantity_kg     = quantity_kg + p_kg,
      last_updated_by = v_actor,
      last_updated_at = now()
  WHERE id = v_stock_id
  RETURNING quantity_kg INTO v_new;

  INSERT INTO roasted_stock_history (
    stock_id, previous_quantity_kg, new_quantity_kg, delta_kg,
    change_type, note, updated_by
  ) VALUES (
    v_stock_id, v_prev, v_new, p_kg,
    'roasted', p_note, v_actor
  );

  RETURN v_new;
END;
$$;

-- A coffee's own loss percentage; null resets it to the default.
CREATE OR REPLACE FUNCTION public.set_green_percent(p_product_id uuid, p_percent numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_actor, 'admin'::public.app_role)
          OR public.has_role(v_actor, 'roaster'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to change loss percentages' USING ERRCODE = '42501';
  END IF;

  IF p_percent IS NOT NULL AND (p_percent < 0 OR p_percent > 50) THEN
    RAISE EXCEPTION 'p_percent must be between 0 and 50, got %', p_percent USING ERRCODE = '22023';
  END IF;

  UPDATE products SET green_percent = p_percent WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- The default loss percentage for coffees without their own.
CREATE OR REPLACE FUNCTION public.set_default_green_percent(p_percent numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_actor, 'admin'::public.app_role)
          OR public.has_role(v_actor, 'roaster'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to change loss percentages' USING ERRCODE = '42501';
  END IF;

  IF p_percent IS NULL OR p_percent < 0 OR p_percent > 50 THEN
    RAISE EXCEPTION 'p_percent must be between 0 and 50, got %', p_percent USING ERRCODE = '22023';
  END IF;

  UPDATE roasting_settings
  SET default_green_percent = p_percent,
      updated_at            = now(),
      updated_by            = v_actor
  WHERE id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_roasted_stock(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_green_percent(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_default_green_percent(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_roasted_stock(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_green_percent(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_default_green_percent(numeric) TO authenticated, service_role;

-- ── 5. Switch-over ──────────────────────────────────────────────────────────
-- Old delivery trigger out first.
DROP TRIGGER IF EXISTS trg_decrease_stock_on_delivery ON public.orders;
DROP FUNCTION IF EXISTS public.decrease_stock_on_delivery();

-- Delivered orders: already subtracted by the old trigger. Mark them deducted
-- without touching stock, before the new trigger exists. updated_at is kept as
-- is (the backfill is bookkeeping, not an edit of the order).
DO $$
DECLARE
  v_has_updated_at_trigger boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass
      AND tgname = 'update_orders_updated_at'
      AND NOT tgisinternal
  ) INTO v_has_updated_at_trigger;

  IF v_has_updated_at_trigger THEN
    EXECUTE 'ALTER TABLE public.orders DISABLE TRIGGER update_orders_updated_at';
  END IF;

  UPDATE public.orders
  SET stock_deducted_at = updated_at
  WHERE status = 'delivered'
    AND stock_deducted_at IS NULL;

  IF v_has_updated_at_trigger THEN
    EXECUTE 'ALTER TABLE public.orders ENABLE TRIGGER update_orders_updated_at';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_orders_stock_on_bagging ON public.orders;
CREATE TRIGGER trg_orders_stock_on_bagging
  BEFORE UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_stock_on_bagging();

-- Open orders already bagged (packed or ready for delivery, not delivered):
-- under the old rule their coffee was never subtracted. Deduct once, through the
-- trigger (the no-op SET fires it; it sees bagged + not yet deducted).
DO $$
DECLARE
  o record;
BEGIN
  FOR o IN
    SELECT id
    FROM public.orders
    WHERE status <> 'delivered'
      AND public.order_is_bagged(status, is_packed)
      AND stock_deducted_at IS NULL
    ORDER BY id
  LOOP
    RAISE NOTICE 'stock deducted at switch-over for order %', o.id;
    UPDATE public.orders SET stock_deducted_at = NULL WHERE id = o.id;
  END LOOP;
END $$;
