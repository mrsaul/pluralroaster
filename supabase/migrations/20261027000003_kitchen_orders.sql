-- Kitchen orders: weekly/urgent orders, items (with product snapshots), history, and café-side RPCs.

CREATE TABLE public.kitchen_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.kitchen_cafes(id),
  week_start date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('weekly', 'urgent')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'ready', 'received', 'declined')),
  urgent_reason text,
  needed_by timestamptz,
  ready_eta timestamptz,
  decline_note text,
  created_by uuid,
  sent_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  ready_at timestamptz,
  received_at timestamptz,
  locked_by uuid,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX kitchen_orders_weekly_unique ON public.kitchen_orders (cafe_id, week_start) WHERE kind = 'weekly';
CREATE INDEX kitchen_orders_cafe_id_idx ON public.kitchen_orders (cafe_id);

CREATE TABLE public.kitchen_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.kitchen_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.kitchen_products(id),
  product_name text NOT NULL,
  unit_label text NOT NULL,
  pieces_per_unit int NOT NULL,
  production_minutes int NOT NULL,
  units int NOT NULL CHECK (units >= 0),
  adjusted_units int CHECK (adjusted_units >= 0),
  served_from_stock_units int NOT NULL DEFAULT 0,
  UNIQUE (order_id, product_id)
);

CREATE INDEX kitchen_order_items_product_id_idx ON public.kitchen_order_items (product_id);

CREATE TABLE public.kitchen_order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.kitchen_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  changed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kitchen_order_history_order_id_idx ON public.kitchen_order_history (order_id);

ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_order_history ENABLE ROW LEVEL SECURITY;

-- Writes go through RPCs only.
REVOKE ALL ON public.kitchen_orders, public.kitchen_order_items, public.kitchen_order_history FROM anon, authenticated;
GRANT SELECT ON public.kitchen_orders, public.kitchen_order_items, public.kitchen_order_history TO authenticated;

CREATE POLICY "Kitchen members view orders" ON public.kitchen_orders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.kitchen_role_of(auth.uid()) = 'stores_manager'
    OR (public.kitchen_role_of(auth.uid()) = 'coffee_manager' AND cafe_id = public.kitchen_cafe_of(auth.uid()))
    OR (public.kitchen_role_of(auth.uid()) = 'kitchen_manager' AND status IN ('approved', 'ready', 'received'))
  );

-- Items and history inherit visibility from the (RLS-filtered) parent order.
CREATE POLICY "Kitchen members view order items" ON public.kitchen_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.kitchen_orders o WHERE o.id = order_id));

CREATE POLICY "Kitchen members view order history" ON public.kitchen_order_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.kitchen_orders o WHERE o.id = order_id));

-- Get or create this production week's draft. Coffee managers always get their own café.
CREATE FUNCTION public.kitchen_get_or_create_draft(p_cafe_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.kitchen_role := public.kitchen_role_of(auth.uid());
  v_cafe uuid;
  v_week date;
  v_id uuid;
BEGIN
  IF v_uid IS NOT NULL AND v_role IS NULL THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;

  IF v_role = 'coffee_manager' THEN
    v_cafe := public.kitchen_cafe_of(v_uid);
  ELSIF v_role = 'stores_manager' OR v_uid IS NULL THEN
    v_cafe := p_cafe_id;
    IF v_cafe IS NULL OR NOT EXISTS (SELECT 1 FROM public.kitchen_cafes WHERE id = v_cafe) THEN
      RAISE EXCEPTION 'invalid_input';
    END IF;
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT week_start INTO v_week FROM public.kitchen_current_week();

  INSERT INTO public.kitchen_orders (cafe_id, week_start, kind, status, created_by)
  VALUES (v_cafe, v_week, 'weekly', 'draft', v_uid)
  ON CONFLICT (cafe_id, week_start) WHERE kind = 'weekly' DO NOTHING;

  SELECT id INTO v_id FROM public.kitchen_orders
  WHERE cafe_id = v_cafe AND week_start = v_week AND kind = 'weekly';
  RETURN v_id;
END;
$$;

-- Set the units of one line (0 removes it).
CREATE FUNCTION public.kitchen_set_item(p_order_id uuid, p_product_id uuid, p_units int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.kitchen_role := public.kitchen_role_of(auth.uid());
  v_order public.kitchen_orders%ROWTYPE;
  v_product public.kitchen_products%ROWTYPE;
BEGIN
  IF v_uid IS NOT NULL AND v_role IS NULL THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;
  IF v_uid IS NOT NULL AND v_role NOT IN ('coffee_manager', 'stores_manager') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_units IS NULL OR p_units < 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF v_role = 'coffee_manager' AND (v_order.cafe_id IS DISTINCT FROM public.kitchen_cafe_of(v_uid) OR v_order.kind <> 'weekly') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_order.status NOT IN ('draft', 'sent', 'approved') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF v_uid IS NOT NULL AND v_order.locked_by IS NOT NULL AND v_order.locked_by <> v_uid
     AND v_order.locked_at > public.kitchen_now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'order_locked';
  END IF;

  IF v_role = 'coffee_manager' AND public.kitchen_now() >= public.kitchen_cutoff_for_week(v_order.week_start) THEN
    RAISE EXCEPTION 'cutoff_passed';
  END IF;

  SELECT * INTO v_product FROM public.kitchen_products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF p_units = 0 THEN
    DELETE FROM public.kitchen_order_items WHERE order_id = p_order_id AND product_id = p_product_id;
  ELSE
    IF NOT v_product.is_visible THEN
      RAISE EXCEPTION 'product_hidden';
    END IF;
    INSERT INTO public.kitchen_order_items (order_id, product_id, product_name, unit_label, pieces_per_unit, production_minutes, units)
    VALUES (p_order_id, p_product_id, v_product.name, v_product.unit_label, v_product.pieces_per_unit, v_product.production_minutes, p_units)
    ON CONFLICT (order_id, product_id) DO UPDATE SET units = EXCLUDED.units;
  END IF;

  IF v_order.status = 'approved' AND v_role = 'coffee_manager' THEN
    UPDATE public.kitchen_orders SET status = 'sent', updated_at = now() WHERE id = p_order_id;
    INSERT INTO public.kitchen_order_history (order_id, status, changed_by, note)
    VALUES (p_order_id, 'sent', v_uid, 'edited by café');
  ELSE
    UPDATE public.kitchen_orders SET updated_at = now() WHERE id = p_order_id;
  END IF;
END;
$$;

CREATE FUNCTION public.kitchen_send_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.kitchen_role := public.kitchen_role_of(auth.uid());
  v_order public.kitchen_orders%ROWTYPE;
BEGIN
  IF v_uid IS NOT NULL AND v_role IS NULL THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;
  IF v_uid IS NOT NULL AND v_role NOT IN ('coffee_manager', 'stores_manager') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF v_role = 'coffee_manager' AND (v_order.cafe_id IS DISTINCT FROM public.kitchen_cafe_of(v_uid) OR v_order.kind <> 'weekly') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF v_uid IS NOT NULL AND v_order.locked_by IS NOT NULL AND v_order.locked_by <> v_uid
     AND v_order.locked_at > public.kitchen_now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'order_locked';
  END IF;

  IF v_role = 'coffee_manager' AND public.kitchen_now() >= public.kitchen_cutoff_for_week(v_order.week_start) THEN
    RAISE EXCEPTION 'cutoff_passed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.kitchen_order_items WHERE order_id = p_order_id AND units > 0) THEN
    RAISE EXCEPTION 'empty_order';
  END IF;

  UPDATE public.kitchen_orders SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.kitchen_order_history (order_id, status, changed_by) VALUES (p_order_id, 'sent', v_uid);
END;
$$;

CREATE FUNCTION public.kitchen_mark_received(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.kitchen_role := public.kitchen_role_of(auth.uid());
  v_order public.kitchen_orders%ROWTYPE;
BEGIN
  IF v_uid IS NOT NULL AND v_role IS NULL THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;
  IF v_uid IS NOT NULL AND v_role <> 'coffee_manager' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF v_role = 'coffee_manager' AND v_order.cafe_id IS DISTINCT FROM public.kitchen_cafe_of(v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_order.status <> 'ready' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE public.kitchen_orders SET status = 'received', received_at = now(), updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.kitchen_order_history (order_id, status, changed_by) VALUES (p_order_id, 'received', v_uid);
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.kitchen_get_or_create_draft(uuid),
  public.kitchen_set_item(uuid, uuid, int),
  public.kitchen_send_order(uuid),
  public.kitchen_mark_received(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.kitchen_get_or_create_draft(uuid),
  public.kitchen_set_item(uuid, uuid, int),
  public.kitchen_send_order(uuid),
  public.kitchen_mark_received(uuid)
TO authenticated, service_role;
