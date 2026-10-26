begin;
select plan(11);
\ir support/kitchen_setup.psql

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select is(public.ensure_current_user_role()::text, null, 'kitchen-only user gets NULL role');
reset role;
select is((select count(*)::int from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000a2'), 0,
  'kitchen-only user gets no user_roles row');

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a7');
select is(public.ensure_current_user_role()::text, 'user', 'brand-new user becomes user');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.ensure_current_user_role()::text, 'user', 'user with both access keeps user role');
select results_eq(
  $$select role::text, cafe_id, cafe_name from public.get_my_kitchen_access()$$,
  $$values ('coffee_manager', '00000000-0000-0000-0000-0000000000c1'::uuid, 'Artivistas')$$,
  'both: kitchen access is coffee_manager of Artivistas');
select results_eq($$select count(*)::int from public.kitchen_members$$, array[1], 'both sees only own kitchen_members row');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.get_my_kitchen_access()), 0, 'coffee_client has no kitchen access');
select is((select count(*)::int from public.kitchen_cafes), 0, 'coffee_client sees no kitchen_cafes');
select is((select count(*)::int from public.kitchen_members), 0, 'coffee_client sees no kitchen_members');
reset role;

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a6');
select is((select count(*)::int from public.kitchen_members), 4, 'admin sees all kitchen_members');
select is((select count(*)::int from public.kitchen_cafes), 2, 'admin sees all kitchen_cafes');
reset role;

select * from finish();
rollback;
