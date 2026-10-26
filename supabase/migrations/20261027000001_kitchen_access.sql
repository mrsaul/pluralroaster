-- Kitchen access foundation: invite-only internal ordering space.

CREATE TYPE public.kitchen_role AS ENUM ('coffee_manager', 'stores_manager', 'kitchen_manager');

CREATE TABLE public.kitchen_cafes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kitchen_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.kitchen_role NOT NULL,
  cafe_id uuid REFERENCES public.kitchen_cafes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role <> 'coffee_manager' OR cafe_id IS NOT NULL)
);

ALTER TABLE public.kitchen_cafes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_members ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.kitchen_role_of(uid uuid)
RETURNS public.kitchen_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.kitchen_members WHERE user_id = uid
$$;

CREATE FUNCTION public.kitchen_cafe_of(uid uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cafe_id FROM public.kitchen_members WHERE user_id = uid
$$;

CREATE FUNCTION public.get_my_kitchen_access()
RETURNS TABLE(role public.kitchen_role, cafe_id uuid, cafe_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.role, m.cafe_id, c.name
  FROM public.kitchen_members m
  LEFT JOIN public.kitchen_cafes c ON c.id = m.cafe_id
  WHERE m.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.kitchen_role_of(uuid), public.kitchen_cafe_of(uuid), public.get_my_kitchen_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_role_of(uuid), public.kitchen_cafe_of(uuid), public.get_my_kitchen_access() TO authenticated, service_role;

-- RLS
CREATE POLICY "Kitchen members and admins can view cafes" ON public.kitchen_cafes
  FOR SELECT TO authenticated
  USING (public.kitchen_role_of(auth.uid()) IS NOT NULL OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert kitchen cafes" ON public.kitchen_cafes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update kitchen cafes" ON public.kitchen_cafes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members view own row, admins view all" ON public.kitchen_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage kitchen members" ON public.kitchen_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ensure_current_user_role: unchanged except kitchen-only users get NULL and no user_roles row.
CREATE OR REPLACE FUNCTION public.ensure_current_user_role()
 RETURNS app_role
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has an active role assigned
  SELECT role INTO existing_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF existing_role IS NOT NULL THEN
    -- Update status to active if it was invited
    UPDATE public.user_roles
    SET status = 'active'
    WHERE user_id = auth.uid() AND status = 'invited';

    RETURN existing_role;
  END IF;

  -- Kitchen-only users have no coffee-app role and must not get one.
  IF EXISTS (SELECT 1 FROM public.kitchen_members WHERE user_id = auth.uid()) THEN
    RETURN NULL;
  END IF;

  -- New users always start as 'user'. Admins must be assigned via the Team panel.
  INSERT INTO public.user_roles (user_id, role, status)
  VALUES (auth.uid(), 'user'::public.app_role, 'active')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN 'user'::public.app_role;
END;
$function$;
