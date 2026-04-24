-- ── Atomic Order Creation ───────────────────────────────────────────────────

create or replace function public.create_order_with_items(
  p_order_data jsonb,
  p_items_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
begin
  -- Insert the parent order
  insert into orders (
    user_id,
    delivery_date,
    total_kg,
    total_price,
    status,
    confirmed_at,
    notes
  ) values (
    (p_order_data->>'user_id')::uuid,
    (p_order_data->>'delivery_date')::date,
    (p_order_data->>'total_kg')::numeric,
    (p_order_data->>'total_price')::numeric,
    (p_order_data->>'status'),
    (p_order_data->>'confirmed_at')::timestamptz,
    (p_order_data->>'notes')
  )
  returning id into v_order_id;

  -- Insert all items for this order
  for v_item in select * from jsonb_array_elements(p_items_data)
  loop
    insert into order_items (
      order_id,
      product_id,
      product_name,
      product_sku,
      price_per_kg,
      quantity,
      size_label,
      size_kg
    ) values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'product_name'),
      (v_item->>'product_sku'),
      (v_item->>'price_per_kg')::numeric,
      (v_item->>'quantity')::numeric,
      (v_item->>'size_label'),
      (v_item->>'size_kg')::numeric
    );
  end loop;

  return v_order_id;
end;
$$;

-- ── Atomic Stock Management ───────────────────────────────────────────────

create or replace function public.update_stock_with_history(
  p_stock_id uuid,
  p_new_qty numeric,
  p_new_threshold numeric,
  p_note text,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_qty numeric;
begin
  -- Fetch current quantity to calculate delta for history
  select quantity_kg into v_prev_qty
  from roasted_stock
  where id = p_stock_id;

  if not found then
    raise exception 'Stock record not found';
  end if;

  -- Insert history record (audit trail)
  insert into roasted_stock_history (
    stock_id,
    previous_quantity_kg,
    new_quantity_kg,
    delta_kg,
    change_type,
    note,
    updated_by
  ) values (
    p_stock_id,
    v_prev_qty,
    p_new_qty,
    p_new_qty - v_prev_qty,
    'manual_update',
    p_note,
    p_updated_by
  );

  -- Update main stock record
  update roasted_stock
  set
    quantity_kg = p_new_qty,
    low_stock_threshold_kg = p_new_threshold,
    last_updated_by = p_updated_by,
    last_updated_at = now()
  where id = p_stock_id;
end;
$$;
