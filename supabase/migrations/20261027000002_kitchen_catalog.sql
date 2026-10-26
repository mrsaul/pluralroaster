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
  reminder_hours_before int NOT NULL DEFAULT 2,
  weekly_capacity_minutes int NOT NULL DEFAULT 1800,
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
CREATE FUNCTION public.kitchen_cutoff_for_week(p_week_start date)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT ((p_week_start - d.k) + s.cutoff_time) AT TIME ZONE 'Europe/Paris'
  FROM public.kitchen_settings s,
  LATERAL (
    SELECT CASE WHEN ((EXTRACT(DOW FROM p_week_start)::int - s.cutoff_weekday + 7) % 7) = 0 THEN 7
                ELSE (EXTRACT(DOW FROM p_week_start)::int - s.cutoff_weekday + 7) % 7 END AS k
  ) d
  WHERE s.id = 1
$$;

-- Earliest Monday whose cutoff is after p_now.
CREATE FUNCTION public.kitchen_current_week(p_now timestamptz DEFAULT public.kitchen_now())
RETURNS TABLE(week_start date, cutoff_at timestamptz)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  d date := date_trunc('week', (p_now AT TIME ZONE 'Europe/Paris'))::date - 7;
  c timestamptz;
BEGIN
  LOOP
    c := public.kitchen_cutoff_for_week(d);
    IF c > p_now THEN
      week_start := d;
      cutoff_at := c;
      RETURN NEXT;
      RETURN;
    END IF;
    d := d + 7;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_now(), public.kitchen_cutoff_for_week(date), public.kitchen_current_week(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_now(), public.kitchen_cutoff_for_week(date), public.kitchen_current_week(timestamptz) TO authenticated, service_role;
