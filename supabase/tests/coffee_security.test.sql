-- Coffee security hardening (migration 20261028000010).
begin;
select plan(24);
\ir support/kitchen_setup.psql

-- Extra fixture: a roaster.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'roaster@test.local', '{}'::jsonb, '{}'::jsonb, now(), now());
delete from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000b1';
insert into public.user_roles (user_id, role, status)
values ('00000000-0000-0000-0000-0000000000b1', 'roaster', 'active');

-- ── Privileges ──────────────────────────────────────────────────────────────
select is(has_function_privilege('anon',
  'public.create_order_with_items(uuid,date,numeric,numeric,text,timestamp with time zone,text,jsonb,uuid,uuid,numeric,text)', 'execute'),
  false, 'anon cannot create orders');
select is(has_function_privilege('authenticated',
  'public.create_order_with_items(uuid,date,numeric,numeric,text,timestamp with time zone,text,jsonb,uuid,uuid,numeric,text)', 'execute'),
  true, 'authenticated can still create orders');
select is(has_function_privilege('anon', 'public.update_stock_with_history(uuid,numeric,numeric,text,uuid)', 'execute'),
  false, 'anon cannot update stock');
select is(has_function_privilege('anon', 'public.ensure_current_user_role()', 'execute'), false, 'anon: no ensure_current_user_role');
select is(has_function_privilege('authenticated', 'public.ensure_current_user_role()', 'execute'), true, 'authenticated: ensure_current_user_role ok');
select is(has_function_privilege('anon', 'public.update_company_contact(uuid,text,text)', 'execute'), false, 'anon: no update_company_contact');
select is(has_function_privilege('anon', 'public.update_company_info(uuid,text,text,text,text)', 'execute'), false, 'anon: no update_company_info');
select is(
  (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('user_save_onboarding_progress', 'user_update_own_onboarding', 'update_company_name')),
  false, 'anon: no onboarding / company-name functions');
select is(
  (select bool_or(has_function_privilege(r, p.oid, 'execute'))
   from pg_proc p, unnest(array['anon', 'authenticated']) r
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('handle_new_user', 'decrease_stock_on_delivery', 'create_stock_row_on_new_product')),
  false, 'trigger functions are not callable by anon/authenticated');
select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('decrease_stock_on_delivery', 'create_stock_row_on_new_product')
     and 'search_path=public' = any(coalesce(p.proconfig, '{}'))),
  2, 'trigger functions have a fixed search_path');
select is(has_function_privilege('authenticated', 'public.has_role(uuid,app_role)', 'execute'), true,
  'has_role still usable by RLS policies');

-- ── Triggers still fire after the revokes ───────────────────────────────────
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a6');  -- admin
insert into public.products (id, name, sellsy_id)
values ('00000000-0000-0000-0000-0000000000d1', 'Test Blend', 'test-sellsy-d1');
reset role;
select is((select quantity_kg from public.roasted_stock where product_id = '00000000-0000-0000-0000-0000000000d1'), 0::numeric,
  'new product still gets a stock row (trigger)');
update public.roasted_stock set quantity_kg = 10 where product_id = '00000000-0000-0000-0000-0000000000d1';

-- ── create_order_with_items ─────────────────────────────────────────────────
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a1');  -- coffee client
select isnt(
  public.create_order_with_items('00000000-0000-0000-0000-0000000000a1', current_date + 7, 2, 40, 'received', now(), null,
    '[{"product_id":"00000000-0000-0000-0000-0000000000d1","product_name":"Test Blend","price_per_kg":20,"quantity":2}]'::jsonb)->>'order_id',
  null, 'client can order for themself');
select throws_ok(
  $$select public.create_order_with_items('00000000-0000-0000-0000-0000000000a3', current_date + 7, 1, 20, 'received', now(), null, '[]'::jsonb)$$,
  '42501', null, 'client cannot order for another user');
reset role;
select is((select count(*)::int from public.orders where user_id = '00000000-0000-0000-0000-0000000000a3'), 0,
  'no order was created for the other user');

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a6');  -- admin
select isnt(
  public.create_order_with_items('00000000-0000-0000-0000-0000000000a3', current_date + 7, 1, 20, 'received', now(), null, '[]'::jsonb)->>'order_id',
  null, 'admin can order on behalf of a client');
reset role;

-- No signed-in user (anon EXECUTE is already covered by the privilege test above;
-- calling pgTAP as role anon crashes the local Postgres, so test the inner guard).
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_order_with_items('00000000-0000-0000-0000-0000000000a1', current_date + 7, 1, 20, 'received', now(), null, '[]'::jsonb)$$,
  '42501', null, 'no signed-in user: create_order_with_items refused');
reset role;

-- Delivered trigger still decreases stock
update public.orders set status = 'delivered' where user_id = '00000000-0000-0000-0000-0000000000a1';
select is((select quantity_kg from public.roasted_stock where product_id = '00000000-0000-0000-0000-0000000000d1'), 8::numeric,
  'delivering an order still decreases stock (trigger)');

-- ── update_stock_with_history ───────────────────────────────────────────────
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a1');  -- client
select throws_ok(
  $$select public.update_stock_with_history((select id from public.roasted_stock where product_id = '00000000-0000-0000-0000-0000000000d1'),
      999, 5, 'hack', '00000000-0000-0000-0000-0000000000a6')$$,
  '42501', null, 'client cannot change stock');
reset role;
select is((select quantity_kg from public.roasted_stock where product_id = '00000000-0000-0000-0000-0000000000d1'), 8::numeric,
  'stock unchanged after refused call');

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000b1');  -- roaster
select lives_ok(
  $$select public.update_stock_with_history((select id from public.roasted_stock where product_id = '00000000-0000-0000-0000-0000000000d1'),
      15, 4, 'recount', '00000000-0000-0000-0000-0000000000a6')$$,
  'roaster can change stock');
reset role;
select is((select quantity_kg from public.roasted_stock where product_id = '00000000-0000-0000-0000-0000000000d1'), 15::numeric,
  'stock updated by roaster');
select is(
  (select updated_by from public.roasted_stock_history h
   join public.roasted_stock s on s.id = h.stock_id
   where s.product_id = '00000000-0000-0000-0000-0000000000d1' and h.change_type = 'manual_update'),
  '00000000-0000-0000-0000-0000000000b1'::uuid, 'history records the real caller, not p_updated_by');

select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a6');  -- admin
select lives_ok(
  $$select public.update_stock_with_history((select id from public.roasted_stock where product_id = '00000000-0000-0000-0000-0000000000d1'),
      12, 4, null, null)$$,
  'admin can change stock');
reset role;

select * from finish();
rollback;
