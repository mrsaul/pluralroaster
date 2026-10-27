begin;
select plan(69);
\ir support/kitchen_setup.psql

set local kitchen.now_override = '2026-11-01 12:00 Europe/Paris';
select id as pand from public.kitchen_products where name = 'Pandebono' \gset
select id as cook from public.kitchen_products where name = 'Cookies' \gset
select id as mardi from public.kitchen_rounds where name = 'Mardi' \gset
select id as vendredi from public.kitchen_rounds where name = 'Vendredi' \gset

-- Draft creation (cafe A manager)
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.kitchen_get_or_create_draft(), public.kitchen_get_or_create_draft(), 'draft creation is idempotent');
reset role;
select id as oid from public.kitchen_orders where cafe_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'weekly' and production_date = '2026-11-03' \gset
select is((select count(*)::int from public.kitchen_orders), 1, 'one weekly order for cafe A');
select is((select status from public.kitchen_orders where id = :'oid'), 'draft', 'new order is a draft');
select is((select production_date from public.kitchen_orders where id = :'oid'), '2026-11-03'::date, 'default draft targets the next open round (Mardi 3 nov.)');
select is((select round_id from public.kitchen_orders where id = :'oid'), :'mardi'::uuid, 'default draft is attached to Mardi');
select is(public.kitchen_order_cutoff(:'oid'), '2026-11-02 20:00 Europe/Paris'::timestamptz, 'order cutoff comes from its round');
select is(has_function_privilege('authenticated', 'public.kitchen_order_cutoff(uuid)', 'execute'), false, 'kitchen_order_cutoff is internal');

-- Following round, coexisting orders, invalid dates
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select public.kitchen_get_or_create_draft(null, '2026-11-06') as ovend \gset
select is(public.kitchen_get_or_create_draft(null, '2026-11-06'), :'ovend'::uuid, 'second draft for the same date returns the same id');
select isnt(:'ovend'::uuid, :'oid'::uuid, 'Vendredi order is a separate order');
select throws_ok($q$select public.kitchen_get_or_create_draft(null, '2026-11-04')$q$, 'invalid_input', 'date with no active round rejected');
reset role;
select is((select round_id from public.kitchen_orders where id = :'ovend'), :'vendredi'::uuid, 'following-round draft attached to Vendredi');
select is((select count(*)::int from public.kitchen_orders where cafe_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'weekly'), 2, 'Mardi and Vendredi orders coexist for café A');

-- Empty order cannot be sent
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_send_order(%L)', :'oid'), 'empty_order', 'empty order cannot be sent');
select throws_ok(format('select public.kitchen_set_item(%L, %L, -1)', :'oid', :'pand'), 'invalid_input', 'negative units rejected');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 2)', :'oid', :'pand'), 'cafe adds 2 pandebono');
select is(public.kitchen_set_item(:'oid', :'pand', 2), false, 'set_item on a draft does not flip');
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
select is(public.kitchen_set_item(:'oid', :'pand', 3), true, 'cafe edit of approved order returns flipped = true');
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
set local kitchen.now_override = '2026-11-02 20:00:30 Europe/Paris';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'oid', :'pand'), 'cutoff_passed', 'set_item after cutoff');
select throws_ok(format('select public.kitchen_send_order(%L)', :'oid'), 'cutoff_passed', 'send after cutoff');
select throws_ok($q$select public.kitchen_get_or_create_draft(null, '2026-11-03')$q$, 'cutoff_passed', 'café cannot open a draft for a round past its cutoff');
select is(public.kitchen_get_or_create_draft(), :'ovend'::uuid, 'after Mardi cutoff the default draft is Vendredi');
reset role;

-- Round edited after orders exist: cutoff recomputed from the round
set local kitchen.now_override = '2026-11-02 19:00 Europe/Paris';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'oid', :'pand'), 'before the 20:00 cutoff the café can edit');
reset role;
update public.kitchen_rounds set cutoff_time = '18:00' where id = :'mardi';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 2)', :'oid', :'pand'), 'cutoff_passed', 'Mardi cutoff moved to 18:00: 19:00 is past it');
reset role;
select is((select production_date from public.kitchen_orders where id = :'oid'), '2026-11-03'::date, 'order keeps its production date after the round edit');
update public.kitchen_rounds set cutoff_time = '20:00' where id = :'mardi';
set local kitchen.now_override = '2026-11-02 20:00:30 Europe/Paris';

-- Stores manager / kitchen manager / urgent
update public.kitchen_orders set status = 'approved' where id = :'oid';
update public.kitchen_orders set locked_by = '00000000-0000-0000-0000-0000000000a5', locked_at = public.kitchen_now() - interval '5 minutes' where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select is(public.kitchen_set_item(:'oid', :'pand', 5), false, 'stores manager edits after cutoff, no flip');
select throws_ok('select public.kitchen_get_or_create_draft()', 'invalid_input', 'stores manager needs a cafe for drafts');
reset role;
select is((select status from public.kitchen_orders where id = :'oid'), 'approved', 'stores manager edit keeps approved');
select is((select locked_at from public.kitchen_orders where id = :'oid'), public.kitchen_now(), 'lock holder write refreshes locked_at');
-- Stores manager may draft hidden products (M1); coffee managers still may not.
update public.kitchen_orders set status = 'draft', locked_by = null, locked_at = null where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 2)', :'oid', :'cook'), 'stores manager can add a hidden product to a draft');
reset role;
select is((select units from public.kitchen_order_items where order_id = :'oid' and product_id = :'cook'), 2, 'hidden product line saved by stores manager');
set local kitchen.now_override = '2026-11-01 12:00 Europe/Paris';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 3)', :'oid', :'cook'), 'product_hidden', 'coffee manager still cannot raise a hidden product');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 0)', :'oid', :'cook'), 'coffee manager can remove a hidden product line');
reset role;
set local kitchen.now_override = '2026-11-02 20:00:30 Europe/Paris';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'oid', :'pand'), 'forbidden', 'kitchen manager cannot set items');
reset role;
insert into public.kitchen_orders (cafe_id, production_date, round_id, kind, status) values ('00000000-0000-0000-0000-0000000000c1', '2026-11-03', :'mardi', 'urgent', 'draft');
select id as uid2 from public.kitchen_orders where kind = 'urgent' \gset
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'uid2', :'pand'), 'forbidden', 'cafe manager cannot edit urgent order');
reset role;
select is(public.kitchen_order_cutoff(:'uid2'), null, 'urgent orders have no cutoff');
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 1)', :'uid2', :'pand'), 'stores manager edits an urgent order (no cutoff)');
reset role;

-- Round in use cannot be deleted; deactivated round keeps its orders approvable
select throws_ok(format('delete from public.kitchen_rounds where id = %L', :'mardi'), 'round_in_use', 'deleting a round with orders is refused');
update public.kitchen_rounds set is_active = false where id = :'mardi';
update public.kitchen_orders set status = 'sent', locked_by = null, locked_at = null where id = :'oid';
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a5');
select lives_ok(format('select public.kitchen_set_item(%L, %L, 2)', :'oid', :'pand'), 'stores manager edits an order of a deactivated round');
select lives_ok(format('select public.kitchen_approve_order(%L)', :'oid'), 'order of a deactivated round stays approvable');
select throws_ok($q$select public.kitchen_get_or_create_draft('00000000-0000-0000-0000-0000000000c2', '2026-11-10')$q$, 'invalid_input', 'no new orders for a deactivated round');
reset role;
select is(public.kitchen_order_cutoff(:'oid'), '2026-11-02 20:00 Europe/Paris'::timestamptz, 'cutoff still computed from the inactive round');
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.kitchen_orders where id = :'oid'), 1, 'café still sees its order of a deactivated round');
reset role;

-- No active rounds at all
update public.kitchen_rounds set is_active = false;
select pg_temp.kitchen_test_act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok('select public.kitchen_get_or_create_draft()', 'no_round', 'no active rounds: no_round');
reset role;
update public.kitchen_rounds set is_active = true;

select * from finish();
rollback;
