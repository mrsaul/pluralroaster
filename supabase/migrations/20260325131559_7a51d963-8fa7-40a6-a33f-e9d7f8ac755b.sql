
-- Add status and invited_at columns to user_roles for user management
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS invited_at timestamp with time zone;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS invited_by uuid;

-- Update ensure_current_user_role to preserve existing roles (roaster/packaging) 
-- and only auto-assign admin/user for new users
CREATE OR REPLACE FUNCTION public.ensure_current_user_role()
 RETURNS app_role
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_email text;
  existing_role public.app_role;
  assigned_role public.app_role;
BEGIN
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

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

  -- New user: assign based on email
  assigned_role := CASE
    WHEN current_email = 'contact@pluralcafe.fr' THEN 'admin'::public.app_role
    ELSE 'user'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role, status)
  VALUES (auth.uid(), assigned_role, 'active')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF assigned_role = 'admin' THEN
    DELETE FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'user'::public.app_role;
  END IF;

  RETURN assigned_role;
END;
$function$;
