-- Kitchen review: stores manager locking/adjusting/approving, urgent orders, ready with stock deduction.

-- Internal guard: caller must be a stores manager (or a trusted caller with no auth.uid()).
CREATE FUNCTION public.kitchen_require_role(p_roles public.kitchen_role[])
RETURNS public.kitchen_role
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.kitchen_role := public.kitchen_role_of(auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND v_role IS NULL THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;
  IF v_uid IS NOT NULL AND NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN v_role;
END;
$$;

CREATE FUNCTION public.kitchen_lock_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.kitchen_orders%ROWTYPE;
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['stores_manager']::public.kitchen_role[]);

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF v_uid IS NOT NULL AND v_order.locked_by IS NOT NULL AND v_order.locked_by <> v_uid
     AND v_order.locked_at > public.kitchen_now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'order_locked';
  END IF;

  UPDATE public.kitchen_orders SET locked_by = v_uid, locked_at = public.kitchen_now() WHERE id = p_order_id;
END;
$$;

CREATE FUNCTION public.kitchen_unlock_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['stores_manager']::public.kitchen_role[]);

  UPDATE public.kitchen_orders SET locked_by = NULL, locked_at = NULL
  WHERE id = p_order_id AND locked_by IS NOT DISTINCT FROM v_uid AND locked_by IS NOT NULL;
END;
$$;

CREATE FUNCTION public.kitchen_adjust_item(p_order_id uuid, p_product_id uuid, p_adjusted_units int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.kitchen_orders%ROWTYPE;
  v_product public.kitchen_products%ROWTYPE;
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['stores_manager']::public.kitchen_role[]);
  IF p_adjusted_units IS NULL OR p_adjusted_units < 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF v_order.status IN ('ready', 'received', 'declined') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  IF v_uid IS NOT NULL AND v_order.locked_by IS NOT NULL AND v_order.locked_by <> v_uid
     AND v_order.locked_at > public.kitchen_now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'order_locked';
  END IF;

  SELECT * INTO v_product FROM public.kitchen_products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  INSERT INTO public.kitchen_order_items (order_id, product_id, product_name, unit_label, pieces_per_unit, production_minutes, units, adjusted_units)
  VALUES (p_order_id, p_product_id, v_product.name, v_product.unit_label, v_product.pieces_per_unit, v_product.production_minutes, 0, p_adjusted_units)
  ON CONFLICT (order_id, product_id) DO UPDATE SET adjusted_units = EXCLUDED.adjusted_units;

  -- A write by the lock holder keeps the lock fresh.
  UPDATE public.kitchen_orders
  SET updated_at = now(),
      locked_at = CASE WHEN v_uid IS NOT NULL AND locked_by = v_uid THEN public.kitchen_now() ELSE locked_at END
  WHERE id = p_order_id;
END;
$$;

CREATE FUNCTION public.kitchen_approve_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.kitchen_orders%ROWTYPE;
  v_changes jsonb;
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['stores_manager']::public.kitchen_role[]);

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF v_order.status <> 'sent' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  IF v_uid IS NOT NULL AND v_order.locked_by IS NOT NULL AND v_order.locked_by <> v_uid
     AND v_order.locked_at > public.kitchen_now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'order_locked';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kitchen_order_items WHERE order_id = p_order_id AND coalesce(adjusted_units, units) > 0) THEN
    RAISE EXCEPTION 'empty_order';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('product_name', product_name, 'from', units, 'to', coalesce(adjusted_units, units)) ORDER BY product_name), '[]'::jsonb)
  INTO v_changes
  FROM public.kitchen_order_items
  WHERE order_id = p_order_id AND coalesce(adjusted_units, units) <> units;

  UPDATE public.kitchen_orders
  SET status = 'approved', approved_by = v_uid, approved_at = now(), locked_by = NULL, locked_at = NULL, updated_at = now()
  WHERE id = p_order_id;
  INSERT INTO public.kitchen_order_history (order_id, status, changed_by) VALUES (p_order_id, 'approved', v_uid);

  RETURN jsonb_build_object('changes', v_changes);
END;
$$;

CREATE FUNCTION public.kitchen_decline_order(p_order_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.kitchen_orders%ROWTYPE;
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['stores_manager']::public.kitchen_role[]);

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF v_order.kind <> 'urgent' OR v_order.status <> 'sent' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  IF v_uid IS NOT NULL AND v_order.locked_by IS NOT NULL AND v_order.locked_by <> v_uid
     AND v_order.locked_at > public.kitchen_now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'order_locked';
  END IF;

  UPDATE public.kitchen_orders
  SET status = 'declined', decline_note = p_note, locked_by = NULL, locked_at = NULL, updated_at = now()
  WHERE id = p_order_id;
  INSERT INTO public.kitchen_order_history (order_id, status, changed_by, note) VALUES (p_order_id, 'declined', v_uid, p_note);
END;
$$;

CREATE FUNCTION public.kitchen_create_urgent_order(p_cafe_id uuid, p_reason text, p_needed_by timestamptz, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.kitchen_role;
  v_cafe uuid;
  v_id uuid;
  v_lines jsonb;
BEGIN
  v_role := public.kitchen_require_role(ARRAY['coffee_manager', 'stores_manager']::public.kitchen_role[]);

  IF v_role = 'coffee_manager' THEN
    v_cafe := public.kitchen_cafe_of(v_uid);
  ELSE
    v_cafe := p_cafe_id;
  END IF;
  IF v_cafe IS NULL OR NOT EXISTS (SELECT 1 FROM public.kitchen_cafes WHERE id = v_cafe) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR p_needed_by IS NULL
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'units', units)), '[]'::jsonb)
  INTO v_lines
  FROM (
    SELECT i.product_id, sum(i.units)::int AS units
    FROM jsonb_to_recordset(p_items) AS i(product_id uuid, units int)
    WHERE i.units IS NOT NULL AND i.units > 0
    GROUP BY i.product_id
  ) g;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'empty_order';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_lines) AS l(product_id uuid, units int)
    LEFT JOIN public.kitchen_products p ON p.id = l.product_id WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF v_role = 'coffee_manager' AND EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_lines) AS l(product_id uuid, units int)
    JOIN public.kitchen_products p ON p.id = l.product_id WHERE NOT p.is_visible
  ) THEN
    RAISE EXCEPTION 'product_hidden';
  END IF;

  INSERT INTO public.kitchen_orders (cafe_id, week_start, kind, status, urgent_reason, needed_by, created_by, sent_at)
  VALUES (v_cafe, date_trunc('week', p_needed_by AT TIME ZONE 'Europe/Paris')::date, 'urgent', 'sent', btrim(p_reason), p_needed_by, v_uid, now())
  RETURNING id INTO v_id;

  INSERT INTO public.kitchen_order_items (order_id, product_id, product_name, unit_label, pieces_per_unit, production_minutes, units)
  SELECT v_id, p.id, p.name, p.unit_label, p.pieces_per_unit, p.production_minutes, l.units
  FROM jsonb_to_recordset(v_lines) AS l(product_id uuid, units int) JOIN public.kitchen_products p ON p.id = l.product_id;

  INSERT INTO public.kitchen_order_history (order_id, status, changed_by) VALUES (v_id, 'sent', v_uid);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.kitchen_set_ready_eta(p_order_id uuid, p_eta timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.kitchen_orders%ROWTYPE;
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['kitchen_manager']::public.kitchen_role[]);

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF v_order.kind <> 'urgent' OR v_order.status <> 'approved' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE public.kitchen_orders SET ready_eta = p_eta, updated_at = now() WHERE id = p_order_id;
END;
$$;

CREATE FUNCTION public.kitchen_mark_ready(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.kitchen_orders%ROWTYPE;
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['kitchen_manager']::public.kitchen_role[]);

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF v_order.status <> 'approved' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- Lock product rows in id order so concurrent orders cannot deadlock.
  PERFORM 1 FROM public.kitchen_products
  WHERE id IN (SELECT product_id FROM public.kitchen_order_items WHERE order_id = p_order_id)
  ORDER BY id FOR UPDATE;

  UPDATE public.kitchen_order_items i
  SET served_from_stock_units = least(p.stock_units, coalesce(i.adjusted_units, i.units))
  FROM public.kitchen_products p
  WHERE i.order_id = p_order_id AND p.id = i.product_id;

  UPDATE public.kitchen_products p
  SET stock_units = p.stock_units - i.served_from_stock_units, updated_at = now()
  FROM public.kitchen_order_items i
  WHERE i.order_id = p_order_id AND i.product_id = p.id AND i.served_from_stock_units > 0;

  UPDATE public.kitchen_orders SET status = 'ready', ready_at = now(), updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.kitchen_order_history (order_id, status, changed_by) VALUES (p_order_id, 'ready', v_uid);
END;
$$;

CREATE FUNCTION public.kitchen_create_order_for_cafe(p_cafe_id uuid, p_week_start date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_week date;
  v_today date := (public.kitchen_now() AT TIME ZONE 'Europe/Paris')::date;
  v_id uuid;
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['stores_manager']::public.kitchen_role[]);

  IF p_cafe_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.kitchen_cafes WHERE id = p_cafe_id AND is_active) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF p_week_start IS NOT NULL THEN
    IF extract(isodow FROM p_week_start) <> 1 OR p_week_start + 7 <= v_today THEN
      RAISE EXCEPTION 'invalid_input';
    END IF;
    v_week := p_week_start;
  ELSE
    SELECT week_start INTO v_week FROM public.kitchen_current_week();
    -- Past the cutoff of a week that has not started yet: target that locked week.
    IF public.kitchen_now() >= public.kitchen_cutoff_for_week(v_week - 7) AND v_today < v_week - 7 THEN
      v_week := v_week - 7;
    END IF;
  END IF;

  INSERT INTO public.kitchen_orders (cafe_id, week_start, kind, status, created_by)
  VALUES (p_cafe_id, v_week, 'weekly', 'draft', v_uid)
  ON CONFLICT (cafe_id, week_start) WHERE kind = 'weekly' DO NOTHING;

  SELECT id INTO v_id FROM public.kitchen_orders
  WHERE cafe_id = p_cafe_id AND week_start = v_week AND kind = 'weekly';
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.kitchen_require_role(public.kitchen_role[]),
  public.kitchen_lock_order(uuid),
  public.kitchen_unlock_order(uuid),
  public.kitchen_adjust_item(uuid, uuid, int),
  public.kitchen_approve_order(uuid),
  public.kitchen_decline_order(uuid, text),
  public.kitchen_create_urgent_order(uuid, text, timestamptz, jsonb),
  public.kitchen_set_ready_eta(uuid, timestamptz),
  public.kitchen_mark_ready(uuid),
  public.kitchen_create_order_for_cafe(uuid, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.kitchen_lock_order(uuid),
  public.kitchen_unlock_order(uuid),
  public.kitchen_adjust_item(uuid, uuid, int),
  public.kitchen_approve_order(uuid),
  public.kitchen_decline_order(uuid, text),
  public.kitchen_create_urgent_order(uuid, text, timestamptz, jsonb),
  public.kitchen_set_ready_eta(uuid, timestamptz),
  public.kitchen_mark_ready(uuid),
  public.kitchen_create_order_for_cafe(uuid, date)
TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.kitchen_require_role(public.kitchen_role[]) FROM authenticated;
