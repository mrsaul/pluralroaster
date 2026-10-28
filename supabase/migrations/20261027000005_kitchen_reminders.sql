-- Kitchen cutoff reminders: once-per-week bookkeeping + pg_cron job that pings the
-- notify-kitchen edge function every 15 minutes. The window logic lives in the function.
--
-- Setup (not in this migration, per environment): store two Vault secrets
--   select vault.create_secret('https://<project>.supabase.co/functions/v1/notify-kitchen', 'kitchen_notify_url');
--   select vault.create_secret('<same value as the KITCHEN_CRON_SECRET function secret>', 'kitchen_cron_secret');
-- Until both exist, kitchen_send_cutoff_reminders() is a no-op.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- pg_cron may be unavailable (e.g. local stack); don't fail the migration.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%): kitchen reminder job not scheduled', SQLERRM;
END;
$$;

CREATE TABLE public.kitchen_reminders_sent (
  week_start date NOT NULL,
  cafe_id uuid NOT NULL REFERENCES public.kitchen_cafes(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, cafe_id)
);

ALTER TABLE public.kitchen_reminders_sent ENABLE ROW LEVEL SECURITY;
-- Service role only (edge function); no policies for anon/authenticated.
REVOKE ALL ON public.kitchen_reminders_sent FROM anon, authenticated;

CREATE FUNCTION public.kitchen_send_cutoff_reminders()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
    INTO v_url USING 'kitchen_notify_url';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
    INTO v_secret USING 'kitchen_cron_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('event', 'cutoff_reminder'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kitchen-cron-secret', v_secret)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_send_cutoff_reminders() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.schedule('kitchen-cutoff-reminder', '*/15 * * * *', 'select public.kitchen_send_cutoff_reminders()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not schedule kitchen-cutoff-reminder (%)', SQLERRM;
END;
$$;
