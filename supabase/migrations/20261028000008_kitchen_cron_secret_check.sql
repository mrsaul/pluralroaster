-- Lets notify-kitchen check the cron secret against the Vault copy (kitchen_cron_secret),
-- so the KITCHEN_CRON_SECRET function secret becomes optional. Returns only a boolean;
-- the secret itself never leaves the database. Service role only.

CREATE FUNCTION public.kitchen_cron_secret_ok(p_secret text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_secret IS NULL OR p_secret = '' OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
    INTO v_secret USING 'kitchen_cron_secret';

  RETURN v_secret IS NOT NULL AND v_secret <> '' AND v_secret = p_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_cron_secret_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_cron_secret_ok(text) TO service_role;
