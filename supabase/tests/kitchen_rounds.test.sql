begin;
select plan(26);
\ir support/kitchen_setup.psql

create temp table r as select name, id from public.kitchen_rounds;
grant select on r to public;

select is((select count(*)::int from public.kitchen_rounds where is_active), 2, 'two seeded active rounds');
select is((select array_agg(name order by production_weekday) from public.kitchen_rounds), array['Mardi','Vendredi'], 'seeded rounds are Mardi and Vendredi');

select is(public.kitchen_round_cutoff((select id from r where name='Mardi'), '2026-11-03'), '2026-11-02 20:00 Europe/Paris'::timestamptz, 'Mardi cutoff is Monday 20:00 Paris');
select is(public.kitchen_round_cutoff((select id from r where name='Vendredi'), '2026-11-06'), '2026-11-05 20:00 Europe/Paris'::timestamptz, 'Vendredi cutoff is Thursday 20:00 Paris');
select is(public.kitchen_round_cutoff((select id from r where name='Mardi'), '2026-03-31'), '2026-03-30 20:00 Europe/Paris'::timestamptz, 'DST change cutoff');
select throws_ok($$select public.kitchen_round_cutoff('00000000-0000-0000-0000-00000000dead', '2026-11-03')$$, 'no_round', 'unknown round raises no_round');

update public.kitchen_rounds set cutoff_weekday = 2 where name = 'Mardi';
select is(public.kitchen_round_cutoff((select id from r where name='Mardi'), '2026-11-03'), '2026-10-27 20:00 Europe/Paris'::timestamptz, 'same weekday cutoff is 7 days before');
update public.kitchen_rounds set cutoff_weekday = 1 where name = 'Mardi';

select results_eq(
  $$select production_date, round_name from public.kitchen_round_occurrences('2026-11-02','2026-11-08')$$,
  $$values ('2026-11-03'::date, 'Mardi'), ('2026-11-06'::date, 'Vendredi')$$,
  'occurrences for one week');
select throws_ok($$select * from public.kitchen_round_occurrences('2026-01-01','2026-06-01')$$, 'invalid_input', 'range over 70 days rejected');

set local kitchen.now_override = '2026-11-02 19:59 Europe/Paris';
select results_eq($$select production_date from public.kitchen_next_open_rounds(2)$$, $$values ('2026-11-03'::date), ('2026-11-06'::date)$$, 'before Mardi cutoff: Mardi then Vendredi');
set local kitchen.now_override = '2026-11-02 20:00:30 Europe/Paris';
select results_eq($$select production_date from public.kitchen_next_open_rounds(2)$$, $$values ('2026-11-06'::date), ('2026-11-10'::date)$$, 'after Mardi cutoff: Vendredi then next Mardi');

update public.kitchen_rounds set is_active = false where name = 'Vendredi';
select is((select count(*)::int from public.kitchen_round_occurrences('2026-11-02','2026-11-08')), 1, 'deactivated round drops out of occurrences');
update public.kitchen_rounds set is_active = false;
select is((select count(*)::int from public.kitchen_next_open_rounds(2)), 0, 'no active rounds: no open rounds');
update public.kitchen_rounds set is_active = true;

select throws_ok($$insert into public.kitchen_rounds (name, production_weekday, cutoff_weekday, cutoff_time, capacity_minutes) values ('Mardi bis', 2, 1, '20:00', 100)$$, '23505', null, 'production_weekday is unique');

select throws_ok($$insert into public.kitchen_rounds (name, production_weekday, cutoff_weekday, cutoff_time, capacity_minutes) values ('Trop', 0, 6, '20:00', 10081)$$, '23514', null, 'insert over 10080 minutes is rejected');
select throws_ok($$update public.kitchen_rounds set capacity_minutes = 10081 where name = 'Mardi'$$, '23514', null, 'update over 10080 minutes is rejected');
select throws_ok($$update public.kitchen_rounds set capacity_minutes = 0 where name = 'Mardi'$$, '23514', null, 'zero capacity is still rejected');
select lives_ok($$update public.kitchen_rounds set capacity_minutes = 10080 where name = 'Mardi'$$, 'exactly 10080 minutes is allowed');
select lives_ok($$insert into public.kitchen_rounds (name, production_weekday, cutoff_weekday, cutoff_time, capacity_minutes, is_active) values ('Max', 0, 6, '20:00', 10080, false)$$, 'insert of exactly 10080 minutes is allowed');
delete from public.kitchen_rounds where name = 'Max';
update public.kitchen_rounds set capacity_minutes = 360 where name = 'Mardi';

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
with u as (update public.kitchen_rounds set capacity_minutes = 1 returning 1)
select is((select count(*)::int from u), 0, 'coffee manager cannot update a round');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
with u as (update public.kitchen_rounds set capacity_minutes = 400 where name = 'Mardi' returning 1)
select is((select count(*)::int from u), 1, 'kitchen manager can update a round');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select is((select count(*)::int from public.kitchen_rounds), 2, 'stores manager can read rounds');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.kitchen_rounds), 0, 'coffee-only client sees no rounds');
select throws_ok($$select * from public.kitchen_round_occurrences('2026-11-02','2026-11-08')$$, 'not_kitchen_member', 'non-member cannot list occurrences');
select throws_ok($$select * from public.kitchen_next_open_rounds(2)$$, 'not_kitchen_member', 'non-member cannot list open rounds');
select throws_ok($$select public.kitchen_round_cutoff(gen_random_uuid(), '2026-11-03')$$, 'not_kitchen_member', 'non-member cannot compute cutoff');
reset role;

select * from finish();
rollback;
