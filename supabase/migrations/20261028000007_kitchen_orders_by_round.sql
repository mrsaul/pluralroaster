-- Kitchen orders keyed by production round: orders move from week_start to production_date + round_id,
-- the order RPCs are rewritten around rounds, and the single-weekly-cutoff model is removed.
-- Runs on a database that already holds orders (backfill before NOT NULL).

-- ---------------------------------------------------------------------------
-- Internal helper: first round occurrence on or after a date (Paris calendar date).
-- Active rounds only; returns no row when there is no active round.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.kitchen_active_round_on_or_after(p_date date)
RETURNS TABLE(round_id uuid, production_date date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.id, p_date + ((r.production_weekday - EXTRACT(DOW FROM p_date)::int + 7) % 7)
  FROM public.kitchen_rounds r
  WHERE r.is_active AND p_date IS NOT NULL
  ORDER BY 2
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.kitchen_active_round_on_or_after(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_active_round_on_or_after(date) TO service_role;

-- ---------------------------------------------------------------------------
-- kitchen_orders: production_date + round_id (backfilled), drop week_start.
-- ---------------------------------------------------------------------------
ALTER TABLE public.kitchen_orders
  ADD COLUMN production_date date,
  ADD COLUMN round_id uuid REFERENCES public.kitchen_rounds(id);

-- Regular orders: first round on or after week_start (the round of that week).
-- Urgent orders: needed-by Paris date if a round produces that day, else the next round after it.
-- Active rounds are preferred; inactive ones are a fallback so existing rows are never orphaned.
UPDATE public.kitchen_orders o
SET production_date = x.production_date, round_id = x.round_id
FROM (
  SELECT o2.id, pick.round_id, pick.production_date
  FROM public.kitchen_orders o2
  CROSS JOIN LATERAL (
    SELECT o2.week_start AS d
    WHERE o2.kind = 'weekly' OR o2.needed_by IS NULL
    UNION ALL
    SELECT (o2.needed_by AT TIME ZONE 'Europe/Paris')::date
    WHERE o2.kind = 'urgent' AND o2.needed_by IS NOT NULL
  ) base
  CROSS JOIN LATERAL (
    SELECT r.id AS round_id,
           base.d + ((r.production_weekday - EXTRACT(DOW FROM base.d)::int + 7) % 7) AS production_date
    FROM public.kitchen_rounds r
    ORDER BY r.is_active DESC, 2
    LIMIT 1
  ) pick
) x
WHERE o.id = x.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.kitchen_orders WHERE production_date IS NULL OR round_id IS NULL) THEN
    RAISE EXCEPTION 'kitchen_orders backfill: some orders could not be attached to a round (no rounds defined?)';
  END IF;
END;
$$;

ALTER TABLE public.kitchen_orders
  ALTER COLUMN production_date SET NOT NULL,
  ALTER COLUMN round_id SET NOT NULL;

DROP INDEX public.kitchen_orders_weekly_unique;
ALTER TABLE public.kitchen_orders DROP COLUMN week_start;

CREATE UNIQUE INDEX kitchen_orders_round_unique ON public.kitchen_orders (cafe_id, production_date) WHERE kind = 'weekly';
CREATE INDEX kitchen_orders_round_id_idx ON public.kitchen_orders (round_id);
CREATE INDEX kitchen_orders_production_date_idx ON public.kitchen_orders (production_date);

-- ---------------------------------------------------------------------------
-- kitchen_reminders_sent: once per café per production date.
-- Existing rows are mapped (week_start + 1 day = the Tuesday production date), so a release
-- inside a reminder window does not re-send reminders.
-- ---------------------------------------------------------------------------
ALTER TABLE public.kitchen_reminders_sent DROP CONSTRAINT kitchen_reminders_sent_pkey;
ALTER TABLE public.kitchen_reminders_sent ADD COLUMN production_date date;
UPDATE public.kitchen_reminders_sent SET production_date = week_start + 1;
DELETE FROM public.kitchen_reminders_sent a
  USING public.kitchen_reminders_sent b
  WHERE a.ctid > b.ctid AND a.production_date = b.production_date AND a.cafe_id = b.cafe_id;
ALTER TABLE public.kitchen_reminders_sent DROP COLUMN week_start;
ALTER TABLE public.kitchen_reminders_sent ALTER COLUMN production_date SET NOT NULL;
ALTER TABLE public.kitchen_reminders_sent ADD PRIMARY KEY (production_date, cafe_id);

-- ---------------------------------------------------------------------------
-- Rounds referenced by orders cannot be deleted (deactivate instead).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.kitchen_rounds_guard_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.kitchen_orders WHERE round_id = OLD.id) THEN
    RAISE EXCEPTION 'round_in_use';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_rounds_guard_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER kitchen_rounds_guard_delete
  BEFORE DELETE ON public.kitchen_rounds
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_rounds_guard_delete();

-- A round's production weekday cannot move, and the round cannot be deactivated, while upcoming
-- orders (today or later, Paris) use it. Deactivation only counts non-draft orders.
-- Cutoff, hours and name stay editable.
CREATE FUNCTION public.kitchen_rounds_guard_weekday()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.production_weekday IS DISTINCT FROM NEW.production_weekday
     AND EXISTS (
       SELECT 1 FROM public.kitchen_orders
       WHERE round_id = OLD.id
         AND production_date >= (public.kitchen_now() AT TIME ZONE 'Europe/Paris')::date
     ) THEN
    RAISE EXCEPTION 'round_in_use';
  END IF;
  IF OLD.is_active AND NOT NEW.is_active
     AND EXISTS (
       SELECT 1 FROM public.kitchen_orders
       WHERE round_id = OLD.id
         AND status <> 'draft'
         AND production_date >= (public.kitchen_now() AT TIME ZONE 'Europe/Paris')::date
     ) THEN
    RAISE EXCEPTION 'round_in_use';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_rounds_guard_weekday() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER kitchen_rounds_guard_weekday
  BEFORE UPDATE OF production_weekday, is_active ON public.kitchen_rounds
  FOR EACH ROW
  WHEN (OLD.production_weekday IS DISTINCT FROM NEW.production_weekday OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.kitchen_rounds_guard_weekday();

-- ---------------------------------------------------------------------------
-- Cutoff of an order: its round's cutoff for its production date; NULL for urgent orders.
-- Computed from the round even when the round is inactive.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.kitchen_order_cutoff(p_order_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.kitchen_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.kind = 'urgent' THEN
    RETURN NULL;
  END IF;
  RETURN public.kitchen_round_cutoff(v_order.round_id, v_order.production_date);
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_order_cutoff(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_order_cutoff(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Draft for a round. Coffee managers always get their own café.
-- Default date: the next open round. A given date with an existing order for the café opens it
-- (even if its round was deactivated since); otherwise it must be an active round's production day.
-- Coffee managers only while the cutoff is ahead.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.kitchen_get_or_create_draft(uuid);

CREATE FUNCTION public.kitchen_get_or_create_draft(p_cafe_id uuid DEFAULT NULL, p_production_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.kitchen_role := public.kitchen_role_of(auth.uid());
  v_cafe uuid;
  v_round uuid;
  v_date date;
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

  IF p_production_date IS NOT NULL THEN
    SELECT id INTO v_id FROM public.kitchen_orders
    WHERE cafe_id = v_cafe AND production_date = p_production_date AND kind = 'weekly';
    IF v_id IS NOT NULL THEN
      IF v_role = 'coffee_manager' AND public.kitchen_now() >= public.kitchen_order_cutoff(v_id) THEN
        RAISE EXCEPTION 'cutoff_passed';
      END IF;
      RETURN v_id;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.kitchen_rounds WHERE is_active) THEN
    RAISE EXCEPTION 'no_round';
  END IF;

  IF p_production_date IS NULL THEN
    SELECT n.round_id, n.production_date INTO v_round, v_date FROM public.kitchen_next_open_rounds(1) n;
    IF v_round IS NULL THEN
      RAISE EXCEPTION 'no_round';
    END IF;
  ELSE
    SELECT r.id INTO v_round FROM public.kitchen_rounds r
    WHERE r.is_active AND r.production_weekday = EXTRACT(DOW FROM p_production_date)::int;
    IF v_round IS NULL THEN
      RAISE EXCEPTION 'invalid_input';
    END IF;
    v_date := p_production_date;
    IF v_role = 'coffee_manager' AND public.kitchen_now() >= public.kitchen_round_cutoff(v_round, v_date) THEN
      RAISE EXCEPTION 'cutoff_passed';
    END IF;
  END IF;

  INSERT INTO public.kitchen_orders (cafe_id, production_date, round_id, kind, status, created_by)
  VALUES (v_cafe, v_date, v_round, 'weekly', 'draft', v_uid)
  ON CONFLICT (cafe_id, production_date) WHERE kind = 'weekly' DO NOTHING;

  SELECT id INTO v_id FROM public.kitchen_orders
  WHERE cafe_id = v_cafe AND production_date = v_date AND kind = 'weekly';
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- set_item / send_order: same rules as before, cutoff taken from the order's round.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_set_item(p_order_id uuid, p_product_id uuid, p_units int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.kitchen_role := public.kitchen_role_of(auth.uid());
  v_order public.kitchen_orders%ROWTYPE;
  v_product public.kitchen_products%ROWTYPE;
  v_locked_at timestamptz;
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

  IF v_role = 'coffee_manager' AND public.kitchen_now() >= public.kitchen_order_cutoff(v_order.id) THEN
    RAISE EXCEPTION 'cutoff_passed';
  END IF;

  SELECT * INTO v_product FROM public.kitchen_products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF p_units = 0 THEN
    DELETE FROM public.kitchen_order_items WHERE order_id = p_order_id AND product_id = p_product_id;
  ELSE
    -- Hidden products are off the café menu; the stores manager may still order them.
    IF v_role = 'coffee_manager' AND NOT v_product.is_visible THEN
      RAISE EXCEPTION 'product_hidden';
    END IF;
    INSERT INTO public.kitchen_order_items (order_id, product_id, product_name, unit_label, pieces_per_unit, production_minutes, units)
    VALUES (p_order_id, p_product_id, v_product.name, v_product.unit_label, v_product.pieces_per_unit, v_product.production_minutes, p_units)
    ON CONFLICT (order_id, product_id) DO UPDATE SET units = EXCLUDED.units;
  END IF;

  -- A write by the lock holder keeps the lock fresh.
  v_locked_at := CASE WHEN v_uid IS NOT NULL AND v_order.locked_by = v_uid THEN public.kitchen_now() ELSE v_order.locked_at END;

  IF v_order.status = 'approved' AND v_role = 'coffee_manager' THEN
    UPDATE public.kitchen_orders SET status = 'sent', locked_at = v_locked_at, updated_at = now() WHERE id = p_order_id;
    INSERT INTO public.kitchen_order_history (order_id, status, changed_by, note)
    VALUES (p_order_id, 'sent', v_uid, 'edited by café');
    RETURN true;
  END IF;

  UPDATE public.kitchen_orders SET locked_at = v_locked_at, updated_at = now() WHERE id = p_order_id;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.kitchen_send_order(p_order_id uuid)
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

  IF v_role = 'coffee_manager' AND public.kitchen_now() >= public.kitchen_order_cutoff(v_order.id) THEN
    RAISE EXCEPTION 'cutoff_passed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.kitchen_order_items WHERE order_id = p_order_id AND units > 0) THEN
    RAISE EXCEPTION 'empty_order';
  END IF;

  UPDATE public.kitchen_orders SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.kitchen_order_history (order_id, status, changed_by) VALUES (p_order_id, 'sent', v_uid);
END;
$$;

-- ---------------------------------------------------------------------------
-- Urgent orders: attached to the needed-by day's round, else the next active round after it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_create_urgent_order(p_cafe_id uuid, p_reason text, p_needed_by timestamptz, p_items jsonb)
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
  v_round uuid;
  v_date date;
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

  SELECT a.round_id, a.production_date INTO v_round, v_date
  FROM public.kitchen_active_round_on_or_after((p_needed_by AT TIME ZONE 'Europe/Paris')::date) a;
  IF v_round IS NULL THEN
    RAISE EXCEPTION 'no_round';
  END IF;

  INSERT INTO public.kitchen_orders (cafe_id, production_date, round_id, kind, status, urgent_reason, needed_by, created_by, sent_at)
  VALUES (v_cafe, v_date, v_round, 'urgent', 'sent', btrim(p_reason), p_needed_by, v_uid, now())
  RETURNING id INTO v_id;

  INSERT INTO public.kitchen_order_items (order_id, product_id, product_name, unit_label, pieces_per_unit, production_minutes, units)
  SELECT v_id, p.id, p.name, p.unit_label, p.pieces_per_unit, p.production_minutes, l.units
  FROM jsonb_to_recordset(v_lines) AS l(product_id uuid, units int) JOIN public.kitchen_products p ON p.id = l.product_id;

  INSERT INTO public.kitchen_order_history (order_id, status, changed_by) VALUES (v_id, 'sent', v_uid);
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Stores manager creates a café's order for a round.
-- Default: the round being decided (cutoff passed, production today or later), else the next open round.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.kitchen_create_order_for_cafe(uuid, date);

CREATE FUNCTION public.kitchen_create_order_for_cafe(p_cafe_id uuid, p_production_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := public.kitchen_now();
  v_today date := (public.kitchen_now() AT TIME ZONE 'Europe/Paris')::date;
  v_round uuid;
  v_date date;
  v_id uuid;
BEGIN
  PERFORM public.kitchen_require_role(ARRAY['stores_manager']::public.kitchen_role[]);

  IF p_cafe_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.kitchen_cafes WHERE id = p_cafe_id AND is_active) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF p_production_date IS NOT NULL THEN
    SELECT r.id INTO v_round FROM public.kitchen_rounds r
    WHERE r.is_active AND r.production_weekday = EXTRACT(DOW FROM p_production_date)::int;
    IF v_round IS NULL OR p_production_date < v_today THEN
      RAISE EXCEPTION 'invalid_input';
    END IF;
    v_date := p_production_date;
  ELSE
    -- Cutoffs fall at most 7 days before production, so [today, today + 7] holds every
    -- occurrence whose cutoff has passed but whose production has not happened yet.
    SELECT o.round_id, o.production_date INTO v_round, v_date
    FROM public.kitchen_round_occurrences(v_today, v_today + 7) o
    WHERE o.cutoff_at <= v_now
    ORDER BY o.cutoff_at DESC, o.production_date DESC
    LIMIT 1;

    IF v_round IS NULL THEN
      SELECT n.round_id, n.production_date INTO v_round, v_date FROM public.kitchen_next_open_rounds(1, v_now) n;
    END IF;
    IF v_round IS NULL THEN
      RAISE EXCEPTION 'no_round';
    END IF;
  END IF;

  INSERT INTO public.kitchen_orders (cafe_id, production_date, round_id, kind, status, created_by)
  VALUES (p_cafe_id, v_date, v_round, 'weekly', 'draft', v_uid)
  ON CONFLICT (cafe_id, production_date) WHERE kind = 'weekly' DO NOTHING;

  SELECT id INTO v_id FROM public.kitchen_orders
  WHERE cafe_id = p_cafe_id AND production_date = v_date AND kind = 'weekly';
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.kitchen_get_or_create_draft(uuid, date),
  public.kitchen_create_order_for_cafe(uuid, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.kitchen_get_or_create_draft(uuid, date),
  public.kitchen_create_order_for_cafe(uuid, date)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Remove the weekly-cutoff model.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.kitchen_current_week(timestamptz);
DROP FUNCTION public.kitchen_cutoff_for_week(date);

ALTER TABLE public.kitchen_settings
  DROP COLUMN cutoff_weekday,
  DROP COLUMN cutoff_time,
  DROP COLUMN weekly_capacity_minutes;
