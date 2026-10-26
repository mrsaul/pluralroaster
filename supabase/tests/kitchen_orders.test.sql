begin;
select plan(40);
\ir support/kitchen_setup.psql

set local kitchen.now_override = '2026-11-01 12:00 Europe/Paris';
select id as pand from public.kitchen_products where name = 'Pandebono' \gset
select id as cook from public.kitchen_products where name = 'Cookies' \gset

-- Draft creation (cafe A manager)
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.kitchen_get_or_create_draft(), public.kitchen_get_or_create_draft(), 'draft creation is idempotent');
reset role;
select id as oid from public.kitchen_orders where cafe_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'weekly' and week_start = '2026-11-02' \gset
select is((select count(*)::int from public.kitchen_orders), 1, 'one weekly order for cafe A');
select is((select status from public.kitchen_orders where id = :'oid'), 'draft', 'new order is a draft');

-- Empty order cannot be sent
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_send_order(%L)', :'oid'), 'empty_order', 'empty order cannot be sent');
select throws_ok(format('select public.kitchen_set_item(%L, %L, -1)', :'oid', :'pand'), 'invalid_input', 'negative units rejected');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 2)', :'oid', :'pand'), 'cafe adds 2 pandebono');
reset role;
select is((select pieces_per_unit from public.kitchen_order_items where order_id = :'oid'), 50, 'pieces_per_unit snapshot');
select is((select production_minutes from public.kitchen_order_items where order_id = :'oid'), 90, 'production_minutes snapshot');
select is((select product_name from public.kitchen_order_items where order_id = :'oid'), 'Pandebono', 'name snapshot');
update public.kitchen_products set pieces_per_unit = 40 where id = :'pand';
select is((select pieces_per_unit from public.kitchen_order_items where order_id = :'oid'), 50, 'snapshot survives product change');

-- Send
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(format('select public.kitchen_send_order(%L)', :'oid'), 'send order');
select throws_ok(format('select public.kitchen_send_order(%L)', :'oid'), 'invalid_status', 'cannot send twice');
reset role;
select is((select status from public.kitchen_orders where id = :'oid'), 'sent', 'status sent');
select is((select count(*)::int from public.kitchen_order_history where order_id = :'oid'), 1, 'one history row after send');

-- Edit after approval returns to sent
update public.kitchen_orders set status = 'approved', approved_by = '00000000-0000-0000-0000-0000000000a5', approved_at = now() where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 3)', :'oid', :'pand'), 'cafe edits approved order');
reset role;
select is((select status from public.kitchen_orders where id = :'oid'), 'sent', 'approved edited back to sent');
select is((select count(*)::int from public.kitchen_order_history where order_id = :'oid' and note = 'edited by café' and status = 'sent'), 1, 'history note edited by café');

-- Lock held by stores manager
update public.kitchen_orders set locked_by = '00000000-0000-0000-0000-0000000000a5', locked_at = public.kitchen_now() where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 4)', :'oid', :'pand'), 'order_locked', 'fresh lock blocks cafe');
reset role;
update public.kitchen_orders set locked_at = public.kitchen_now() - interval '11 minutes' where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 4)', :'oid', :'pand'), 'stale lock ignored');
-- zero deletes the line
select lives_ok(format('select public.kitchen_set_item(%L, %L, 0)', :'oid', :'pand'), 'zero units');
reset role;
select is((select count(*)::int from public.kitchen_order_items where order_id = :'oid'), 0, 'zero units deletes the line');

-- Hidden product
update public.kitchen_products set is_visible = false where id = :'cook';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'oid', :'cook'), 'product_hidden', 'hidden product rejected');
reset role;

-- Cafe B isolation
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*)::int from public.kitchen_orders), 0, 'cafe B sees no orders of A');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'oid', :'pand'), 'forbidden', 'cafe B cannot edit A order');
reset role;

-- Kitchen manager visibility
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.kitchen_orders), 0, 'kitchen manager does not see sent orders');
select throws_ok('select public.kitchen_get_or_create_draft()', 'forbidden', 'kitchen manager cannot create drafts');
reset role;
update public.kitchen_orders set status = 'approved' where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.kitchen_orders), 1, 'kitchen manager sees approved order');
select ok((select count(*) from public.kitchen_order_history) >= 1, 'kitchen manager sees history of approved order');
reset role;

-- Coffee-only client
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.kitchen_orders) + (select count(*)::int from public.kitchen_order_items) + (select count(*)::int from public.kitchen_order_history), 0, 'coffee-only client sees nothing');
select throws_ok('select public.kitchen_get_or_create_draft()', 'not_kitchen_member', 'coffee-only client cannot create draft');
reset role;

-- Receive
update public.kitchen_orders set status = 'ready' where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(format('select public.kitchen_mark_received(%L)', :'oid'), 'forbidden', 'cafe B cannot receive A order');
reset role;
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(format('select public.kitchen_mark_received(%L)', :'oid'), 'cafe A marks received');
reset role;
select is((select status from public.kitchen_orders where id = :'oid'), 'received', 'status received');

-- Cutoff
update public.kitchen_orders set status = 'draft' where id = :'oid';
set local kitchen.now_override = '2026-11-01 20:00:30 Europe/Paris';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'oid', :'pand'), 'cutoff_passed', 'set_item after cutoff');
select throws_ok(format('select public.kitchen_send_order(%L)', :'oid'), 'cutoff_passed', 'send after cutoff');
reset role;

-- Stores manager / kitchen manager / urgent
update public.kitchen_orders set status = 'approved' where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 5)', :'oid', :'pand'), 'stores manager edits after cutoff');
select throws_ok('select public.kitchen_get_or_create_draft()', 'invalid_input', 'stores manager needs a cafe for drafts');
reset role;
select is((select status from public.kitchen_orders where id = :'oid'), 'approved', 'stores manager edit keeps approved');
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'oid', :'pand'), 'forbidden', 'kitchen manager cannot set items');
reset role;
insert into public.kitchen_orders (cafe_id, week_start, kind, status) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-02', 'urgent', 'draft');
select id as uid2 from public.kitchen_orders where kind = 'urgent' \gset
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'uid2', :'pand'), 'forbidden', 'cafe manager cannot edit urgent order');
reset role;

select * from finish();
rollback;
