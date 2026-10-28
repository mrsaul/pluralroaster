begin;
select plan(11);

select has_table('public', 'kitchen_reminders_sent', 'kitchen_reminders_sent exists');
select col_is_pk('public', 'kitchen_reminders_sent', array['production_date', 'cafe_id'], 'primary key (production_date, cafe_id)');
select hasnt_column('public', 'kitchen_reminders_sent', 'week_start', 'week_start dropped');
select has_function('public', 'kitchen_send_cutoff_reminders', 'reminder function exists');

-- No vault secrets configured in the test database: must be a silent no-op.
select lives_ok($$select public.kitchen_send_cutoff_reminders()$$, 'returns without error when vault secrets are absent');

select is(
  has_function_privilege('authenticated', 'public.kitchen_send_cutoff_reminders()', 'execute'),
  false, 'authenticated cannot execute the reminder function');

select has_function('public', 'kitchen_cron_secret_ok', array['text'], 'cron secret check exists');
select is(public.kitchen_cron_secret_ok('anything'), false, 'cron secret check is false when Vault has no secret');
select is(public.kitchen_cron_secret_ok(null), false, 'cron secret check is false for null');
select is(
  has_function_privilege('authenticated', 'public.kitchen_cron_secret_ok(text)', 'execute'),
  false, 'authenticated cannot execute the cron secret check');
select is(
  has_function_privilege('anon', 'public.kitchen_cron_secret_ok(text)', 'execute'),
  false, 'anon cannot execute the cron secret check');

select * from finish();
rollback;
