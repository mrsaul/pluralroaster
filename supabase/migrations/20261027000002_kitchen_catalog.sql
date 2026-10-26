-- Kitchen catalog, settings and production-week functions.

CREATE TABLE public.kitchen_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  photo_url text,
  unit_label text NOT NULL,
  pieces_per_unit int NOT NULL CHECK (pieces_per_unit > 0),
  stock_units int NOT NULL DEFAULT 0 CHECK (stock_units >= 0),
  production_minutes int NOT NULL DEFAULT 0 CHECK (production_minutes >= 0),
  is_visible boolean NOT NULL DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kitchen_settings (
  id int PRIMARY KEY CHECK (id = 1),
  cutoff_weekday int NOT NULL DEFAULT 0 CHECK (cutoff_weekday BETWEEN 0 AND 6),
  cutoff_time time NOT NULL DEFAULT '20:00',
  reminder_hours_before int NOT NULL DEFAULT 2 CHECK (reminder_hours_before >= 0),
  weekly_capacity_minutes int NOT NULL DEFAULT 1800 CHECK (weekly_capacity_minutes > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.kitchen_settings (id) VALUES (1);

INSERT INTO public.kitchen_products (name, unit_label, pieces_per_unit, production_minutes, sort_order) VALUES
  ('Banana bread', 'Whole cake', 1, 60, 1),
  ('Pandebono', 'Batch', 50, 90, 2),
  ('Empanadas', 'Batch', 30, 120, 3),
  ('Cookies', 'Batch', 50, 60, 4);

ALTER TABLE public.kitchen_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kitchen members view products" ON public.kitchen_products
  FOR SELECT TO authenticated
  USING (
    public.kitchen_role_of(auth.uid()) IN ('stores_manager', 'kitchen_manager')
    OR (public.kitchen_role_of(auth.uid()) = 'coffee_manager' AND is_visible)
  );
CREATE POLICY "Kitchen managers insert products" ON public.kitchen_products
  FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_role_of(auth.uid()) = 'kitchen_manager');
CREATE POLICY "Kitchen managers update products" ON public.kitchen_products
  FOR UPDATE TO authenticated
  USING (public.kitchen_role_of(auth.uid()) = 'kitchen_manager')
  WITH CHECK (public.kitchen_role_of(auth.uid()) = 'kitchen_manager');
CREATE POLICY "Kitchen managers delete products" ON public.kitchen_products
  FOR DELETE TO authenticated
  USING (public.kitchen_role_of(auth.uid()) = 'kitchen_manager');

CREATE POLICY "Kitchen members view settings" ON public.kitchen_settings
  FOR SELECT TO authenticated
  USING (public.kitchen_role_of(auth.uid()) IS NOT NULL);
CREATE POLICY "Kitchen managers update settings" ON public.kitchen_settings
  FOR UPDATE TO authenticated
  USING (public.kitchen_role_of(auth.uid()) = 'kitchen_manager')
  WITH CHECK (public.kitchen_role_of(auth.uid()) = 'kitchen_manager');

-- Time source: tests freeze it with `set local kitchen.now_override = '...'`.
CREATE FUNCTION public.kitchen_now()
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(nullif(current_setting('kitchen.now_override', true), '')::timestamptz, now())
$$;

-- Last cutoff_weekday at cutoff_time (Europe/Paris) strictly before p_week_start 00:00 Paris.
-- SECURITY DEFINER so RLS on kitchen_settings cannot hide the row; access is checked explicitly.
-- Callers without auth.uid() (postgres, service role, other definer functions) are allowed.
CREATE FUNCTION public.kitchen_cutoff_for_week(p_week_start date)
RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.kitchen_settings%ROWTYPE;
  k int;
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.kitchen_role_of(auth.uid()) IS NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;

  SELECT * INTO s FROM public.kitchen_settings WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'kitchen_settings row missing';
  END IF;

  k := (EXTRACT(DOW FROM p_week_start)::int - s.cutoff_weekday + 7) % 7;
  IF k = 0 THEN k := 7; END IF;
  RETURN ((p_week_start - k) + s.cutoff_time) AT TIME ZONE 'Europe/Paris';
END;
$$;

-- Earliest Monday whose cutoff is after p_now.
CREATE FUNCTION public.kitchen_current_week(p_now timestamptz DEFAULT public.kitchen_now())
RETURNS TABLE(week_start date, cutoff_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d date := date_trunc('week', (p_now AT TIME ZONE 'Europe/Paris'))::date - 7;
  c timestamptz;
  i int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.kitchen_role_of(auth.uid()) IS NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;

  LOOP
    c := public.kitchen_cutoff_for_week(d);
    IF c IS NULL THEN
      RAISE EXCEPTION 'kitchen cutoff could not be computed';
    END IF;
    IF c > p_now THEN
      week_start := d;
      cutoff_at := c;
      RETURN NEXT;
      RETURN;
    END IF;
    d := d + 7;
    i := i + 1;
    IF i > 10 THEN
      RAISE EXCEPTION 'kitchen_current_week did not converge';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_now(), public.kitchen_cutoff_for_week(date), public.kitchen_current_week(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_now(), public.kitchen_cutoff_for_week(date), public.kitchen_current_week(timestamptz) TO authenticated, service_role;
