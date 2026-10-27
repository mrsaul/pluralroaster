begin;
select plan(6);

select has_table('public', 'kitchen_reminders_sent', 'kitchen_reminders_sent exists');
select col_is_pk('public', 'kitchen_reminders_sent', array['production_date', 'cafe_id'], 'primary key (production_date, cafe_id)');
select hasnt_column('public', 'kitchen_reminders_sent', 'week_start', 'week_start dropped');
select has_function('public', 'kitchen_send_cutoff_reminders', 'reminder function exists');

-- No vault secrets configured in the test database: must be a silent no-op.
select lives_ok($$select public.kitchen_send_cutoff_reminders()$$, 'returns without error when vault secrets are absent');

select is(
  has_function_privilege('authenticated', 'public.kitchen_send_cutoff_reminders()', 'execute'),
  false, 'authenticated cannot execute the reminder function');

select * from finish();
rollback;
