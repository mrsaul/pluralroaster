-- Kitchen production rounds: replaces the single weekly cutoff with named rounds (Mardi/Vendredi).
-- Additive only: the old week functions and kitchen_settings columns are removed in a later migration.

CREATE TABLE public.kitchen_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  production_weekday int NOT NULL UNIQUE CHECK (production_weekday BETWEEN 0 AND 6),
  cutoff_weekday int NOT NULL CHECK (cutoff_weekday BETWEEN 0 AND 6),
  cutoff_time time NOT NULL,
  capacity_minutes int NOT NULL CHECK (capacity_minutes > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.kitchen_rounds (name, production_weekday, cutoff_weekday, cutoff_time, capacity_minutes) VALUES
  ('Mardi',    2, 1, '20:00', 360),
  ('Vendredi', 5, 4, '20:00', 360);

ALTER TABLE public.kitchen_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kitchen members and admins can view rounds" ON public.kitchen_rounds
  FOR SELECT TO authenticated
  USING (public.kitchen_role_of(auth.uid()) IS NOT NULL OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Kitchen managers can insert rounds" ON public.kitchen_rounds
  FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_role_of(auth.uid()) = 'kitchen_manager');
CREATE POLICY "Kitchen managers can update rounds" ON public.kitchen_rounds
  FOR UPDATE TO authenticated
  USING (public.kitchen_role_of(auth.uid()) = 'kitchen_manager')
  WITH CHECK (public.kitchen_role_of(auth.uid()) = 'kitchen_manager');
CREATE POLICY "Kitchen managers can delete rounds" ON public.kitchen_rounds
  FOR DELETE TO authenticated
  USING (public.kitchen_role_of(auth.uid()) = 'kitchen_manager');

-- Cutoff of a round for a given production date: the latest cutoff_weekday/cutoff_time
-- strictly before the production date (same weekday => 7 days before), Paris time.
CREATE FUNCTION public.kitchen_round_cutoff(p_round_id uuid, p_production_date date)
RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.kitchen_rounds%ROWTYPE;
  k int;
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.kitchen_role_of(auth.uid()) IS NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;

  SELECT * INTO r FROM public.kitchen_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_round';
  END IF;

  k := (EXTRACT(DOW FROM p_production_date)::int - r.cutoff_weekday + 7) % 7;
  IF k = 0 THEN k := 7; END IF;
  RETURN ((p_production_date - k) + r.cutoff_time) AT TIME ZONE 'Europe/Paris';
END;
$$;

CREATE FUNCTION public.kitchen_round_occurrences(p_from date, p_to date)
RETURNS TABLE(round_id uuid, round_name text, production_date date, cutoff_at timestamptz, capacity_minutes int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.kitchen_role_of(auth.uid()) IS NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 70 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  RETURN QUERY
  SELECT r.id, r.name, d::date,
         public.kitchen_round_cutoff(r.id, d::date),
         r.capacity_minutes
  FROM public.kitchen_rounds r
  CROSS JOIN LATERAL generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS d
  WHERE r.is_active
    AND EXTRACT(DOW FROM d)::int = r.production_weekday
  ORDER BY d::date, r.production_weekday;
END;
$$;

CREATE FUNCTION public.kitchen_next_open_rounds(p_count int DEFAULT 2, p_now timestamptz DEFAULT public.kitchen_now())
RETURNS TABLE(round_id uuid, round_name text, production_date date, cutoff_at timestamptz, capacity_minutes int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.kitchen_role_of(auth.uid()) IS NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_kitchen_member';
  END IF;

  IF p_count IS NULL OR p_count < 1 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  -- Cutoffs fall at most 7 days before production, so a 70-day window from yesterday
  -- covers any realistic p_count of upcoming occurrences.
  RETURN QUERY
  SELECT o.round_id, o.round_name, o.production_date, o.cutoff_at, o.capacity_minutes
  FROM public.kitchen_round_occurrences((p_now AT TIME ZONE 'Europe/Paris')::date - 1,
                                        (p_now AT TIME ZONE 'Europe/Paris')::date + 69) o
  WHERE o.cutoff_at > p_now
  ORDER BY o.production_date
  LIMIT p_count;
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_round_cutoff(uuid, date), public.kitchen_round_occurrences(date, date), public.kitchen_next_open_rounds(int, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_round_cutoff(uuid, date), public.kitchen_round_occurrences(date, date), public.kitchen_next_open_rounds(int, timestamptz) TO authenticated, service_role;
