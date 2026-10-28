begin;
select plan(63);
\ir support/kitchen_setup.psql

set local kitchen.now_override = '2026-11-01 12:00 Europe/Paris';
select id as pand from public.kitchen_products where name = 'Pandebono' \gset
select id as cook from public.kitchen_products where name = 'Cookies' \gset
select id as bread from public.kitchen_products where name = 'Banana bread' \gset
select id as mardi from public.kitchen_rounds where name = 'Mardi' \gset
select id as vendredi from public.kitchen_rounds where name = 'Vendredi' \gset

-- Weekly order sent by café A: cookies 1
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select public.kitchen_get_or_create_draft() as oid \gset
select public.kitchen_set_item(:'oid', :'cook', 1);
select public.kitchen_send_order(:'oid');
select throws_ok(format('select public.kitchen_approve_order(%L)', :'oid'), 'forbidden', 'coffee manager cannot approve');
select throws_ok(format('select public.kitchen_lock_order(%L)', :'oid'), 'forbidden', 'coffee manager cannot lock');
select throws_ok(format('select public.kitchen_adjust_item(%L, %L, 0)', :'oid', :'cook'), 'forbidden', 'coffee manager cannot adjust');
reset role;

-- Lock / adjust / approve
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select lives_ok(format('select public.kitchen_lock_order(%L)', :'oid'), 'stores manager locks');
select lives_ok(format('select public.kitchen_adjust_item(%L, %L, 0)', :'oid', :'cook'), 'adjust cookies to 0');
select lives_ok(format('select public.kitchen_adjust_item(%L, %L, 1)', :'oid', :'bread'), 'add banana bread 1');
select throws_ok(format('select public.kitchen_adjust_item(%L, %L, -1)', :'oid', :'bread'), 'invalid_input', 'negative adjust rejected');
reset role;
update public.kitchen_orders set locked_at = public.kitchen_now() - interval '5 minutes' where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select public.kitchen_adjust_item(:'oid', :'bread', 1);
reset role;
select is((select locked_at from public.kitchen_orders where id = :'oid'), public.kitchen_now(), 'lock holder adjust refreshes locked_at');
select is((select units from public.kitchen_order_items where order_id = :'oid' and product_id = :'bread'), 0, 'added line has units 0');
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select is(public.kitchen_approve_order(:'oid'),
  '{"changes":[{"product_name":"Banana bread","from":0,"to":1},{"product_name":"Cookies","from":1,"to":0}]}'::jsonb
  , 'approve returns change list');
reset role;
select is((select status from public.kitchen_orders where id = :'oid'), 'approved', 'status approved');
select is((select locked_by from public.kitchen_orders where id = :'oid'), null, 'lock cleared');
select is((select count(*)::int from public.kitchen_order_history where order_id = :'oid' and status = 'approved'), 1, 'approved history row');

-- Lock conflicts
update public.kitchen_orders set status = 'sent', locked_by = '00000000-0000-0000-0000-0000000000a6', locked_at = public.kitchen_now() where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select throws_ok(format('select public.kitchen_lock_order(%L)', :'oid'), 'order_locked', 'fresh foreign lock blocks lock');
select throws_ok(format('select public.kitchen_adjust_item(%L, %L, 2)', :'oid', :'bread'), 'order_locked', 'fresh foreign lock blocks adjust');
reset role;
update public.kitchen_orders set locked_at = public.kitchen_now() - interval '11 minutes' where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select lives_ok(format('select public.kitchen_lock_order(%L)', :'oid'), 'stale lock can be taken');
select lives_ok(format('select public.kitchen_unlock_order(%L)', :'oid'), 'unlock');
-- approve after cutoff + 1h
set local kitchen.now_override = '2026-11-02 21:00 Europe/Paris';
select lives_ok(format('select public.kitchen_approve_order(%L)', :'oid'), 'approve after cutoff');
reset role;

-- Urgent orders
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format($q$select public.kitchen_create_urgent_order(null, '  ', '2026-11-04 10:00 Europe/Paris', '[{"product_id":"%s","units":2}]')$q$, :'pand'), 'invalid_input', 'urgent needs a reason');
select throws_ok(format($q$select public.kitchen_create_urgent_order(null, 'x', '2026-11-04 10:00 Europe/Paris', '[{"product_id":"%s","units":0}]')$q$, :'pand'), 'empty_order', 'urgent needs a line');
select public.kitchen_create_urgent_order(null, 'Event', '2026-11-04 10:00 Europe/Paris', format('[{"product_id":"%s","units":2}]', :'pand')::jsonb) as urg \gset
reset role;
select is((select production_date from public.kitchen_orders where id = :'urg'), '2026-11-06'::date, 'urgent needed mercredi goes to the next round (vendredi)');
select is((select round_id from public.kitchen_orders where id = :'urg'), :'vendredi'::uuid, 'urgent attached to Vendredi');
select is((select status || kind from public.kitchen_orders where id = :'urg'), 'senturgent', 'urgent is sent');
select is((select cafe_id from public.kitchen_orders where id = :'urg'), '00000000-0000-0000-0000-0000000000c1'::uuid, 'urgent for own café');
select is((select count(*)::int from public.kitchen_order_history where order_id = :'urg' and status = 'sent'), 1, 'urgent history row');

-- Decline
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select throws_ok(format('select public.kitchen_decline_order(%L, %L)', :'oid', 'no'), 'invalid_status', 'cannot decline weekly');
select public.kitchen_create_urgent_order('00000000-0000-0000-0000-0000000000c2', 'Oops', '2026-11-05 10:00 Europe/Paris', format('[{"product_id":"%s","units":1}]', :'cook')::jsonb) as urg2 \gset
select lives_ok(format('select public.kitchen_decline_order(%L, %L)', :'urg2', 'no capacity'), 'decline urgent');
select public.kitchen_create_urgent_order('00000000-0000-0000-0000-0000000000c2', 'Same day', '2026-11-06 09:00 Europe/Paris', format('[{"product_id":"%s","units":1}]', :'cook')::jsonb) as urg3 \gset
reset role;
select is((select production_date from public.kitchen_orders where id = :'urg3'), '2026-11-06'::date, 'urgent needed on a production day stays on that day');
alter table public.kitchen_rounds disable trigger kitchen_rounds_guard_weekday;
update public.kitchen_rounds set is_active = false;
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select throws_ok(format($q$select public.kitchen_create_urgent_order('00000000-0000-0000-0000-0000000000c2', 'x', '2026-11-06 09:00 Europe/Paris', '[{"product_id":"%s","units":1}]')$q$, :'cook'), 'no_round', 'urgent with no active rounds: no_round');
reset role;
update public.kitchen_rounds set is_active = true;
alter table public.kitchen_rounds enable trigger kitchen_rounds_guard_weekday;
select is((select status || decline_note from public.kitchen_orders where id = :'urg2'), 'declinedno capacity', 'declined with note');

-- Ready + stock
update public.kitchen_products set stock_units = 1 where id = :'pand';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select public.kitchen_approve_order(:'urg');
reset role;
update public.kitchen_order_items set units = 3 where order_id = :'urg';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(format('select public.kitchen_set_ready_eta(%L, %L)', :'urg', '2026-11-04 09:00 Europe/Paris'), 'set eta on approved urgent');
select throws_ok(format('select public.kitchen_set_ready_eta(%L, now())', :'oid'), 'invalid_status', 'eta on weekly rejected');
select lives_ok(format('select public.kitchen_mark_ready(%L)', :'urg'), 'mark ready');
reset role;
select is((select stock_units from public.kitchen_products where id = :'pand'), 0, 'stock drained');
select is((select served_from_stock_units from public.kitchen_order_items where order_id = :'urg'), 1, 'served 1 from stock');
select is((select status from public.kitchen_orders where id = :'urg'), 'ready', 'status ready');

insert into public.kitchen_orders (cafe_id, production_date, round_id, kind, status, urgent_reason, needed_by) values ('00000000-0000-0000-0000-0000000000c2', '2026-11-03', :'mardi', 'urgent', 'approved', 'r', now()) returning id as o2 \gset
insert into public.kitchen_order_items (order_id, product_id, product_name, unit_label, pieces_per_unit, production_minutes, units) values (:'o2', :'pand', 'Pandebono', 'Batch', 50, 90, 2);
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select public.kitchen_mark_ready(:'o2');
select throws_ok(format('select public.kitchen_mark_ready(%L)', :'urg2'), 'invalid_status', 'mark ready on declined');
reset role;
select is((select served_from_stock_units from public.kitchen_order_items where order_id = :'o2'), 0, 'second order served 0');
select is((select stock_units from public.kitchen_products where id = :'pand'), 0, 'stock stays 0');

-- mark_ready on sent
update public.kitchen_orders set status = 'sent' where id = :'o2';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format('select public.kitchen_mark_ready(%L)', :'o2'), 'invalid_status', 'mark ready on sent');
reset role;

-- Receive
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(format('select public.kitchen_mark_received(%L)', :'urg'), 'café receives ready order');
reset role;

-- create order for cafe (after Mardi cutoff 2026-11-02 21:00)
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select is(public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2'), public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2'), 'create order for cafe is idempotent');
select is((select production_date from public.kitchen_orders where id = public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2')), '2026-11-03'::date, 'default targets the round being decided (Mardi, cutoff passed)');
select is((select round_id from public.kitchen_orders where id = public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2')), :'mardi'::uuid, 'round being decided is Mardi');
select public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2', '2026-11-10') as onext \gset
select is((select production_date from public.kitchen_orders where id = :'onext'), '2026-11-10'::date, 'explicit later round');
select throws_ok($q$select public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2', '2026-11-11')$q$, 'invalid_input', 'date with no active round rejected');
select throws_ok($q$select public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2', '2026-10-30')$q$, 'invalid_input', 'past round rejected');
set local kitchen.now_override = '2026-11-04 10:00 Europe/Paris';
select public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2') as owed \gset
select is((select production_date from public.kitchen_orders where id = :'owed'), '2026-11-06'::date, 'mercredi: Mardi produced, Vendredi still open -> next open round');
set local kitchen.now_override = '2026-11-02 21:00 Europe/Paris';
select throws_ok($q$select public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000ff')$q$, 'invalid_input', 'unknown café');
reset role;

-- adjust after cutoff, mark_ready uses adjusted units, hidden product in urgent
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select lives_ok(format('select public.kitchen_adjust_item(%L, %L, 1)', public.kitchen_create_order_for_cafe('00000000-0000-0000-0000-0000000000c2'), :'bread'), 'stores manager adjusts after cutoff');
reset role;
update public.kitchen_products set stock_units = 5 where id = :'cook';
insert into public.kitchen_orders (cafe_id, production_date, round_id, kind, status, urgent_reason, needed_by) values ('00000000-0000-0000-0000-0000000000c2', '2026-11-03', :'mardi', 'urgent', 'approved', 'r', now()) returning id as o3 \gset
insert into public.kitchen_order_items (order_id, product_id, product_name, unit_label, pieces_per_unit, production_minutes, units, adjusted_units) values (:'o3', :'cook', 'Cookies', 'Batch', 50, 60, 3, 1);
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(format('select public.kitchen_mark_ready(%L)', :'o3'), 'mark ready with adjusted units');
reset role;
select is((select served_from_stock_units from public.kitchen_order_items where order_id = :'o3'), 1, 'served uses adjusted units');
select is((select stock_units from public.kitchen_products where id = :'cook'), 4, 'stock 5 -> 4');
update public.kitchen_products set is_visible = false where id = :'bread';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format($q$select public.kitchen_create_urgent_order(null, 'x', '2026-11-04 10:00 Europe/Paris', '[{"product_id":"%s","units":1}]')$q$, :'bread'), 'product_hidden', 'coffee manager urgent with hidden product');
reset role;

-- Coffee-only client
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format('select public.kitchen_lock_order(%L)', :'oid'), 'not_kitchen_member', 'lock: not member');
select throws_ok(format('select public.kitchen_unlock_order(%L)', :'oid'), 'not_kitchen_member', 'unlock: not member');
select throws_ok(format('select public.kitchen_adjust_item(%L, %L, 1)', :'oid', :'cook'), 'not_kitchen_member', 'adjust: not member');
select throws_ok(format('select public.kitchen_approve_order(%L)', :'oid'), 'not_kitchen_member', 'approve: not member');
select throws_ok(format('select public.kitchen_decline_order(%L, %L)', :'oid', 'x'), 'not_kitchen_member', 'decline: not member');
select throws_ok(format($q$select public.kitchen_create_urgent_order(null, 'x', now(), '[]')$q$), 'not_kitchen_member', 'urgent: not member');
select throws_ok(format('select public.kitchen_set_ready_eta(%L, now())', :'oid'), 'not_kitchen_member', 'eta: not member');
select throws_ok(format('select public.kitchen_mark_ready(%L)', :'oid'), 'not_kitchen_member', 'ready: not member');
select throws_ok(format('select public.kitchen_create_order_for_cafe(%L)', '00000000-0000-0000-0000-0000000000c1'), 'not_kitchen_member', 'create_for_cafe: not member');
reset role;

select * from finish();
rollback;
