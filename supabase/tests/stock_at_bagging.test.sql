-- Stock at bagging (migration 20261124000000_stock_at_bagging.sql).
--
-- Plain SQL, not pgTAP: run right after the migration, in the same transaction,
-- and roll back:
--   BEGIN; <migration>; <this file>; ROLLBACK;
-- Each check raises 'FAIL: …' on failure; the last statement returns
-- 'ALL STOCK TESTS PASSED'. Only the switch-over check reads existing orders.

ALTER TABLE public.orders DISABLE TRIGGER "notify-new-order";  -- no emails

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- A: coffee with 10 kg in stock. B: coffee without a stock row. S: delivery service.
INSERT INTO public.products (id, name, sellsy_id, kind) VALUES
  ('f5a0c000-0000-4000-8000-0000000000a1', 'Test Stock A', 'test-stock-bagging-a', 'coffee'),
  ('f5a0c000-0000-4000-8000-0000000000b1', 'Test Stock B', 'test-stock-bagging-b', 'coffee'),
  ('f5a0c000-0000-4000-8000-0000000000c1', 'Test Stock Service', 'test-stock-bagging-s', 'service');

UPDATE public.roasted_stock SET quantity_kg = 10
WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
DELETE FROM public.roasted_stock
WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000b1';

DO $$
DECLARE v numeric;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'FAIL: setup A stock 10 got %', v; END IF;
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000c1';
  IF v IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FAIL: setup service stock row 0 got %', v; END IF;
END $$;

-- ── switch-over: orders the OLD rule deducted but no longer delivered ───────
-- Order 5: ready_for_delivery with an order_delivered −4 row (delivered, then
-- moved back before release). Order 6: approved, unpacked, same history.
-- Inserted with stock_deducted_at null (INSERT does not fire the trigger), as
-- they would be before the migration; A's 10 kg already reflect the old deduction.
INSERT INTO public.orders (id, user_id, delivery_date, status) VALUES
  ('f5a0c000-0000-4000-8000-000000000005', NULL, current_date, 'ready_for_delivery'),
  ('f5a0c000-0000-4000-8000-000000000006', NULL, current_date, 'approved');
INSERT INTO public.order_items (order_id, product_id, product_name, quantity, kind) VALUES
  ('f5a0c000-0000-4000-8000-000000000005', 'f5a0c000-0000-4000-8000-0000000000a1', 'Test Stock A', 4, 'coffee'),
  ('f5a0c000-0000-4000-8000-000000000006', 'f5a0c000-0000-4000-8000-0000000000a1', 'Test Stock A', 4, 'coffee');
INSERT INTO public.roasted_stock_history (
  stock_id, previous_quantity_kg, new_quantity_kg, delta_kg, change_type, order_id, note)
SELECT s.id, 14, 10, -4, 'order_delivered', o.id, 'old rule'
FROM public.roasted_stock s
CROSS JOIN (VALUES ('f5a0c000-0000-4000-8000-000000000005'::uuid),
                   ('f5a0c000-0000-4000-8000-000000000006'::uuid)) AS o(id)
WHERE s.product_id = 'f5a0c000-0000-4000-8000-0000000000a1';

SELECT public.stock_at_bagging_switch_over();

DO $$
DECLARE v numeric; n int; d5 timestamptz; d6 timestamptz;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'FAIL: switch-over old-delivered A stock got %', v; END IF;
  SELECT count(*) INTO n FROM public.roasted_stock_history
  WHERE order_id IN ('f5a0c000-0000-4000-8000-000000000005', 'f5a0c000-0000-4000-8000-000000000006')
    AND change_type <> 'order_delivered';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: switch-over old-delivered new history rows got %', n; END IF;
  SELECT stock_deducted_at INTO d5 FROM public.orders WHERE id = 'f5a0c000-0000-4000-8000-000000000005';
  SELECT stock_deducted_at INTO d6 FROM public.orders WHERE id = 'f5a0c000-0000-4000-8000-000000000006';
  IF d5 IS NULL OR d6 IS NULL THEN
    RAISE EXCEPTION 'FAIL: switch-over old-delivered stock_deducted_at got % / %', d5, d6;
  END IF;
END $$;

-- Order 6: an unrelated edit changes nothing; bagging does not deduct again;
-- unbagging gives +4 back once.
UPDATE public.orders SET notes = 'edited' WHERE id = 'f5a0c000-0000-4000-8000-000000000006';
UPDATE public.orders SET is_packed = true WHERE id = 'f5a0c000-0000-4000-8000-000000000006';

DO $$
DECLARE v numeric; n int;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'FAIL: old-delivered edit + bag A stock got %', v; END IF;
  SELECT count(*) INTO n FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000006' AND change_type <> 'order_delivered';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: old-delivered edit + bag history rows got %', n; END IF;
END $$;

UPDATE public.orders SET is_packed = false WHERE id = 'f5a0c000-0000-4000-8000-000000000006';

DO $$
DECLARE v numeric; n int; d numeric;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 14 THEN RAISE EXCEPTION 'FAIL: old-delivered unbag A stock got %', v; END IF;
  SELECT count(*), max(delta_kg) INTO n, d FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000006' AND change_type = 'order_unpacked';
  IF n <> 1 OR d IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FAIL: old-delivered unbag order_unpacked rows got % (delta %)', n, d;
  END IF;
END $$;

-- Back to 10 kg for the cases below.
UPDATE public.roasted_stock SET quantity_kg = 10
WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';

-- Order 1: 4 kg A, 3 kg B, 1 service line.
INSERT INTO public.orders (id, user_id, delivery_date, status)
VALUES ('f5a0c000-0000-4000-8000-000000000001', NULL, current_date, 'approved');
INSERT INTO public.order_items (order_id, product_id, product_name, quantity, kind) VALUES
  ('f5a0c000-0000-4000-8000-000000000001', 'f5a0c000-0000-4000-8000-0000000000a1', 'Test Stock A', 4, 'coffee'),
  ('f5a0c000-0000-4000-8000-000000000001', 'f5a0c000-0000-4000-8000-0000000000b1', 'Test Stock B', 3, 'coffee'),
  ('f5a0c000-0000-4000-8000-000000000001', 'f5a0c000-0000-4000-8000-0000000000c1', 'Test Stock Service', 1, 'service');

-- ── tick is_packed → A 10 → 6, one order_packed −4, stock_deducted_at set ───
UPDATE public.orders SET is_packed = true WHERE id = 'f5a0c000-0000-4000-8000-000000000001';

DO $$
DECLARE v numeric; n int; d timestamptz;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FAIL: tick is_packed A stock got %', v; END IF;

  SELECT count(*), min(h.delta_kg) INTO n, v
  FROM public.roasted_stock_history h
  JOIN public.roasted_stock s ON s.id = h.stock_id
  WHERE s.product_id = 'f5a0c000-0000-4000-8000-0000000000a1'
    AND h.order_id = 'f5a0c000-0000-4000-8000-000000000001'
    AND h.change_type = 'order_packed';
  IF n <> 1 OR v IS DISTINCT FROM -4 THEN
    RAISE EXCEPTION 'FAIL: tick is_packed order_packed rows got % (delta %)', n, v;
  END IF;

  SELECT stock_deducted_at INTO d FROM public.orders WHERE id = 'f5a0c000-0000-4000-8000-000000000001';
  IF d IS NULL THEN RAISE EXCEPTION 'FAIL: tick is_packed stock_deducted_at got %', d; END IF;

  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000c1';
  IF v IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FAIL: tick is_packed service stock got %', v; END IF;
  SELECT count(*) INTO n
  FROM public.roasted_stock_history h
  JOIN public.roasted_stock s ON s.id = h.stock_id
  WHERE s.product_id = 'f5a0c000-0000-4000-8000-0000000000c1';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: tick is_packed service history rows got %', n; END IF;

  SELECT count(*) INTO n FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000b1';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: tick is_packed B stock rows got %', n; END IF;
END $$;

-- ── tick again, packaging → ready_for_delivery while packed → no 2nd deduction
UPDATE public.orders SET is_packed = true WHERE id = 'f5a0c000-0000-4000-8000-000000000001';
UPDATE public.orders SET status = 'packaging' WHERE id = 'f5a0c000-0000-4000-8000-000000000001';
UPDATE public.orders SET status = 'ready_for_delivery' WHERE id = 'f5a0c000-0000-4000-8000-000000000001';
-- A caller writing stock_deducted_at is ignored (the column belongs to the trigger).
UPDATE public.orders SET stock_deducted_at = NULL WHERE id = 'f5a0c000-0000-4000-8000-000000000001';

DO $$
DECLARE v numeric; n int;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FAIL: no second deduction A stock got %', v; END IF;
  SELECT count(*) INTO n FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000001' AND change_type = 'order_packed';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: no second deduction order_packed rows got %', n; END IF;
END $$;

-- ── untick is_packed while status approved → A back to 10 ───────────────────
UPDATE public.orders SET status = 'approved' WHERE id = 'f5a0c000-0000-4000-8000-000000000001';

DO $$
DECLARE v numeric;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FAIL: approved but still packed A stock got %', v; END IF;
END $$;

UPDATE public.orders SET is_packed = false WHERE id = 'f5a0c000-0000-4000-8000-000000000001';

DO $$
DECLARE v numeric; n int; d timestamptz;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'FAIL: untick is_packed A stock got %', v; END IF;

  SELECT count(*), max(delta_kg) INTO n, v FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000001' AND change_type = 'order_unpacked';
  IF n <> 1 OR v IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FAIL: untick is_packed order_unpacked rows got % (delta %)', n, v;
  END IF;

  SELECT stock_deducted_at INTO d FROM public.orders WHERE id = 'f5a0c000-0000-4000-8000-000000000001';
  IF d IS NOT NULL THEN RAISE EXCEPTION 'FAIL: untick is_packed stock_deducted_at got %', d; END IF;
END $$;

-- ── ready_for_delivery without is_packed → deducted once ────────────────────
UPDATE public.orders SET status = 'ready_for_delivery' WHERE id = 'f5a0c000-0000-4000-8000-000000000001';

DO $$
DECLARE v numeric; n int;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FAIL: ready_for_delivery A stock got %', v; END IF;
  SELECT count(*) INTO n FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000001' AND change_type = 'order_packed';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: ready_for_delivery order_packed rows got %', n; END IF;
END $$;

-- ── delivered after that → unchanged, no order_delivered row ────────────────
UPDATE public.orders SET status = 'delivered' WHERE id = 'f5a0c000-0000-4000-8000-000000000001';

DO $$
DECLARE v numeric; n int;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FAIL: delivered A stock got %', v; END IF;
  SELECT count(*) INTO n FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000001' AND change_type = 'order_delivered';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: delivered order_delivered rows got %', n; END IF;
END $$;

-- ── clamp: A at 1, 4 kg bagged → 0 (delta −1); unbag → 1, not 4 ─────────────
UPDATE public.roasted_stock SET quantity_kg = 1
WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';

INSERT INTO public.orders (id, user_id, delivery_date, status)
VALUES ('f5a0c000-0000-4000-8000-000000000002', NULL, current_date, 'approved');
INSERT INTO public.order_items (order_id, product_id, product_name, quantity, kind) VALUES
  ('f5a0c000-0000-4000-8000-000000000002', 'f5a0c000-0000-4000-8000-0000000000a1', 'Test Stock A', 4, 'coffee');

UPDATE public.orders SET is_packed = true WHERE id = 'f5a0c000-0000-4000-8000-000000000002';

DO $$
DECLARE v numeric; dv numeric;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FAIL: clamp bag A stock got %', v; END IF;
  SELECT delta_kg INTO dv FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000002' AND change_type = 'order_packed';
  IF dv IS DISTINCT FROM -1 THEN RAISE EXCEPTION 'FAIL: clamp bag delta got %', dv; END IF;
END $$;

UPDATE public.orders SET is_packed = false WHERE id = 'f5a0c000-0000-4000-8000-000000000002';

DO $$
DECLARE v numeric;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FAIL: clamp unbag A stock got %', v; END IF;
END $$;

-- ── delete a bagged order → its kilos back, history kept with order_id null ─
UPDATE public.roasted_stock SET quantity_kg = 10
WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';

INSERT INTO public.orders (id, user_id, delivery_date, status)
VALUES ('f5a0c000-0000-4000-8000-000000000003', NULL, current_date, 'approved');
INSERT INTO public.order_items (order_id, product_id, product_name, quantity, kind) VALUES
  ('f5a0c000-0000-4000-8000-000000000003', 'f5a0c000-0000-4000-8000-0000000000a1', 'Test Stock A', 4, 'coffee');

UPDATE public.orders SET is_packed = true WHERE id = 'f5a0c000-0000-4000-8000-000000000003';

DO $$
DECLARE v numeric;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FAIL: delete setup A stock got %', v; END IF;
END $$;

DELETE FROM public.orders WHERE id = 'f5a0c000-0000-4000-8000-000000000003';

DO $$
DECLARE v numeric; n int; s numeric;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'FAIL: delete bagged order A stock got %', v; END IF;

  -- Orders 1 and 2 still exist, so A's only history rows without an order are order 3's.
  SELECT count(*), sum(h.delta_kg) INTO n, s
  FROM public.roasted_stock_history h
  JOIN public.roasted_stock st ON st.id = h.stock_id
  WHERE st.product_id = 'f5a0c000-0000-4000-8000-0000000000a1'
    AND h.order_id IS NULL
    AND h.change_type IN ('order_packed', 'order_unpacked');
  IF n <> 2 OR s IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL: delete bagged order history rows got % (net %)', n, s;
  END IF;
END $$;

-- ── delivered under the OLD rule, moved back → kilos back once; re-bag → −4 once
-- Simulate the old delivery trigger: order inserted delivered and already marked
-- deducted (the new trigger does not fire on INSERT, as with the backfill),
-- A 10 → 6 with an order_delivered −4 history row.
INSERT INTO public.orders (id, user_id, delivery_date, status, stock_deducted_at)
VALUES ('f5a0c000-0000-4000-8000-000000000004', NULL, current_date, 'delivered', now());
INSERT INTO public.order_items (order_id, product_id, product_name, quantity, kind) VALUES
  ('f5a0c000-0000-4000-8000-000000000004', 'f5a0c000-0000-4000-8000-0000000000a1', 'Test Stock A', 4, 'coffee');
UPDATE public.roasted_stock SET quantity_kg = 6
WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
INSERT INTO public.roasted_stock_history (
  stock_id, previous_quantity_kg, new_quantity_kg, delta_kg, change_type, order_id, note)
SELECT id, 10, 6, -4, 'order_delivered', 'f5a0c000-0000-4000-8000-000000000004', 'old rule'
FROM public.roasted_stock WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';

UPDATE public.orders SET status = 'approved', is_packed = false
WHERE id = 'f5a0c000-0000-4000-8000-000000000004';

DO $$
DECLARE v numeric; n int; d timestamptz;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'FAIL: old delivered moved back A stock got %', v; END IF;
  SELECT count(*), max(delta_kg) INTO n, v FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000004' AND change_type = 'order_unpacked';
  IF n <> 1 OR v IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FAIL: old delivered moved back order_unpacked rows got % (delta %)', n, v;
  END IF;
  SELECT stock_deducted_at INTO d FROM public.orders WHERE id = 'f5a0c000-0000-4000-8000-000000000004';
  IF d IS NOT NULL THEN RAISE EXCEPTION 'FAIL: old delivered moved back stock_deducted_at got %', d; END IF;
END $$;

UPDATE public.orders SET is_packed = true WHERE id = 'f5a0c000-0000-4000-8000-000000000004';

DO $$
DECLARE v numeric; n int;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FAIL: old delivered re-bagged A stock got %', v; END IF;
  SELECT count(*), min(delta_kg) INTO n, v FROM public.roasted_stock_history
  WHERE order_id = 'f5a0c000-0000-4000-8000-000000000004' AND change_type = 'order_packed';
  IF n <> 1 OR v IS DISTINCT FROM -4 THEN
    RAISE EXCEPTION 'FAIL: old delivered re-bagged order_packed rows got % (delta %)', n, v;
  END IF;
END $$;

-- ── delete a delivered order → stock unchanged ──────────────────────────────
UPDATE public.orders SET status = 'delivered' WHERE id = 'f5a0c000-0000-4000-8000-000000000004';
DELETE FROM public.orders WHERE id = 'f5a0c000-0000-4000-8000-000000000004';

DO $$
DECLARE v numeric;
BEGIN
  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FAIL: delete delivered order A stock got %', v; END IF;
END $$;

-- ── RPCs ────────────────────────────────────────────────────────────────────
DO $$
DECLARE v numeric;
BEGIN
  SELECT default_green_percent INTO v FROM public.roasting_settings WHERE id;
  IF v IS DISTINCT FROM 15 THEN RAISE EXCEPTION 'FAIL: roasting_settings seeded 15 got %', v; END IF;
END $$;

-- No signed-in user → refused.
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL role authenticated;

DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    PERFORM public.add_roasted_stock('f5a0c000-0000-4000-8000-0000000000b1', 30);
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL: add_roasted_stock without user raises 42501 got %', v_state;
  END IF;
END $$;

RESET role;

-- Impersonate an active admin (one with a profile: history.updated_by references profiles).
DO $$
DECLARE v_admin uuid;
BEGIN
  SELECT ur.user_id INTO v_admin
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'::public.app_role AND ur.status = 'active'
  ORDER BY ur.user_id
  LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'FAIL: setup active admin got %', v_admin; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
END $$;

SET LOCAL role authenticated;

DO $$
DECLARE v numeric; v_state text;
BEGIN
  -- add_roasted_stock(B, 30): creates B's row.
  v := public.add_roasted_stock('f5a0c000-0000-4000-8000-0000000000b1', 30, 'test roast');
  IF v IS DISTINCT FROM 30 THEN RAISE EXCEPTION 'FAIL: add_roasted_stock returns new quantity got %', v; END IF;

  -- 0 kg → raises.
  v_state := NULL;
  BEGIN
    PERFORM public.add_roasted_stock('f5a0c000-0000-4000-8000-0000000000b1', 0);
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FAIL: add_roasted_stock with 0 raises 22023 got %', v_state;
  END IF;

  -- 51 % → raises.
  v_state := NULL;
  BEGIN
    PERFORM public.set_green_percent('f5a0c000-0000-4000-8000-0000000000a1', 51);
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FAIL: set_green_percent 51 raises 22023 got %', v_state;
  END IF;
END $$;

-- set_green_percent(A, 17) then check as owner.
SELECT public.set_green_percent('f5a0c000-0000-4000-8000-0000000000a1', 17);
RESET role;

DO $$
DECLARE v numeric;
BEGIN
  SELECT green_percent INTO v FROM public.products WHERE id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS DISTINCT FROM 17 THEN RAISE EXCEPTION 'FAIL: set_green_percent 17 got %', v; END IF;
END $$;

SET LOCAL role authenticated;
SELECT public.set_green_percent('f5a0c000-0000-4000-8000-0000000000a1', NULL);
SELECT public.set_default_green_percent(12);
RESET role;

DO $$
DECLARE v numeric; n int; d numeric; ct text; ub uuid; v_admin uuid;
BEGIN
  v_admin := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;

  SELECT green_percent INTO v FROM public.products WHERE id = 'f5a0c000-0000-4000-8000-0000000000a1';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'FAIL: set_green_percent null got %', v; END IF;

  SELECT default_green_percent INTO v FROM public.roasting_settings WHERE id;
  IF v IS DISTINCT FROM 12 THEN RAISE EXCEPTION 'FAIL: set_default_green_percent 12 got %', v; END IF;

  SELECT quantity_kg INTO v FROM public.roasted_stock
  WHERE product_id = 'f5a0c000-0000-4000-8000-0000000000b1';
  IF v IS DISTINCT FROM 30 THEN RAISE EXCEPTION 'FAIL: add_roasted_stock B stock got %', v; END IF;

  SELECT count(*), max(h.delta_kg), max(h.change_type), max(h.updated_by::text)::uuid
    INTO n, d, ct, ub
  FROM public.roasted_stock_history h
  JOIN public.roasted_stock s ON s.id = h.stock_id
  WHERE s.product_id = 'f5a0c000-0000-4000-8000-0000000000b1';
  IF n <> 1 OR d IS DISTINCT FROM 30 OR ct IS DISTINCT FROM 'roasted' OR ub IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'FAIL: add_roasted_stock history got % rows (delta %, type %, by %)', n, d, ct, ub;
  END IF;
END $$;

-- ── switch-over: every delivered order is marked deducted ───────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.orders
  WHERE status = 'delivered' AND stock_deducted_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: switch-over delivered orders without stock_deducted_at got %', n; END IF;

  SELECT count(*) INTO n FROM public.orders
  WHERE status <> 'delivered'
    AND public.order_is_bagged(status, is_packed)
    AND stock_deducted_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: switch-over bagged open orders without stock_deducted_at got %', n; END IF;
END $$;

SELECT 'ALL STOCK TESTS PASSED' AS result;
