-- Staff invited by email (or logging in with an email code) never chose a password.
-- The app asks them to set one once; this tells it whether the signed-in user has one.
-- Returns only a boolean about the caller themself; never exposes the hash.
CREATE OR REPLACE FUNCTION public.current_user_has_password()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT coalesce(u.encrypted_password IS NOT NULL AND u.encrypted_password <> '', false)
  FROM auth.users u
  WHERE u.id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_user_has_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_password() TO authenticated, service_role;
