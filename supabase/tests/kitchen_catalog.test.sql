begin;
select plan(17);
\ir support/kitchen_setup.psql

-- Week model removed: settings keep only the reminder lead time; rounds own cutoffs and capacity.
select hasnt_column('public', 'kitchen_settings', 'cutoff_weekday', 'settings: cutoff_weekday dropped');
select hasnt_column('public', 'kitchen_settings', 'cutoff_time', 'settings: cutoff_time dropped');
select hasnt_column('public', 'kitchen_settings', 'weekly_capacity_minutes', 'settings: weekly_capacity_minutes dropped');
select has_column('public', 'kitchen_settings', 'reminder_hours_before', 'settings: reminder_hours_before kept');
select hasnt_function('public', 'kitchen_current_week', 'kitchen_current_week dropped');
select hasnt_function('public', 'kitchen_cutoff_for_week', 'kitchen_cutoff_for_week dropped');
set local kitchen.now_override = '2026-11-01 20:00 Europe/Paris';

-- RLS
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
update public.kitchen_products set is_visible = false where name = 'Cookies';
select is((select count(*)::int from public.kitchen_products), 4, 'kitchen manager sees 4 products');
select is((select count(*)::int from public.kitchen_settings), 1, 'kitchen manager sees settings');
select throws_ok($$update public.kitchen_products set stock_units = -1 where name = 'Cookies'$$, '23514', null, 'negative stock rejected');
with u as (update public.kitchen_products set stock_units = 9 where name = 'Pandebono' returning 1)
select is((select count(*)::int from u), 1, 'kitchen manager can update stock');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.kitchen_products), 3, 'coffee manager sees 3 visible products');
with u as (update public.kitchen_products set stock_units = 9 returning 1)
select is((select count(*)::int from u), 0, 'coffee manager updates 0 rows');
with u as (update public.kitchen_settings set reminder_hours_before = 5 returning 1)
select is((select count(*)::int from u), 0, 'coffee manager cannot update settings');
select is((select production_date from public.kitchen_next_open_rounds(1)), '2026-11-03'::date, 'coffee manager can call kitchen_next_open_rounds');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select is((select count(*)::int from public.kitchen_products), 4, 'stores manager sees all 4 products incl. hidden');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.kitchen_products), 0, 'coffee-only client sees no products');
select is((select count(*)::int from public.kitchen_settings), 0, 'coffee-only client sees no settings');
reset role;

select * from finish();
rollback;
