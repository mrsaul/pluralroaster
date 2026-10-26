begin;
select plan(20);
\ir support/kitchen_setup.psql

-- Cutoff and week functions (run as postgres)
select is(public.kitchen_cutoff_for_week('2026-11-02'), '2026-11-01 20:00 Europe/Paris'::timestamptz, 'default cutoff is Sunday 20:00 Paris');
set local kitchen.now_override = '2026-11-01 19:59 Europe/Paris';
select is((select week_start from public.kitchen_current_week()), '2026-11-02'::date, 'before cutoff: next Monday');
set local kitchen.now_override = '2026-11-01 20:00 Europe/Paris';
select is((select week_start from public.kitchen_current_week()), '2026-11-09'::date, 'at cutoff: following Monday');
select is((select cutoff_at from public.kitchen_current_week()), '2026-11-08 20:00 Europe/Paris'::timestamptz, 'cutoff_at of the following week');
select is(public.kitchen_cutoff_for_week('2026-03-30'), '2026-03-29 20:00 Europe/Paris'::timestamptz, 'DST change day cutoff');

update public.kitchen_settings set cutoff_weekday = 6, cutoff_time = '18:00';
select is(public.kitchen_cutoff_for_week('2026-11-02'), '2026-10-31 18:00 Europe/Paris'::timestamptz, 'Saturday 18:00 cutoff');
update public.kitchen_settings set cutoff_weekday = 1, cutoff_time = '08:00';
select is(public.kitchen_cutoff_for_week('2026-11-02'), '2026-10-26 08:00 Europe/Paris'::timestamptz, 'Monday 08:00 cutoff is a full week earlier');
update public.kitchen_settings set cutoff_weekday = 0, cutoff_time = '20:00';

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
select is((select week_start from public.kitchen_current_week()), '2026-11-09'::date, 'coffee manager can call kitchen_current_week');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select is((select count(*)::int from public.kitchen_products), 4, 'stores manager sees all 4 products incl. hidden');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.kitchen_products), 0, 'coffee-only client sees no products');
select is((select count(*)::int from public.kitchen_settings), 0, 'coffee-only client sees no settings');
select throws_ok($$select * from public.kitchen_current_week()$$, 'not_kitchen_member', 'coffee-only client cannot call kitchen_current_week');
select throws_ok($$select public.kitchen_cutoff_for_week('2026-11-02')$$, 'not_kitchen_member', 'coffee-only client cannot call kitchen_cutoff_for_week');
reset role;

select * from finish();
rollback;
