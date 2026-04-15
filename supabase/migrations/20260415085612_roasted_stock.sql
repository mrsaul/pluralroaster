-- ── Tables ────────────────────────────────────────────────────────────────────

create table roasted_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  quantity_kg numeric(10,2) not null default 0,
  low_stock_threshold_kg numeric(10,2) not null default 5,
  last_updated_by uuid references profiles(id),
  last_updated_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint one_stock_per_product unique (product_id)
);

create table roasted_stock_history (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references roasted_stock(id) on delete cascade,
  previous_quantity_kg numeric(10,2) not null,
  new_quantity_kg numeric(10,2) not null,
  delta_kg numeric(10,2) not null,
  change_type text not null check (
    change_type in ('manual_update', 'order_delivered')
  ),
  order_id uuid references orders(id) on delete set null,
  note text,
  updated_by uuid references profiles(id),
  updated_at timestamptz default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table roasted_stock enable row level security;
alter table roasted_stock_history enable row level security;

-- roasted_stock: SELECT all authenticated
create policy "stock_select_all" on roasted_stock
  for select to authenticated using (true);

-- roasted_stock: INSERT admin and roaster
create policy "stock_insert_admin_roaster" on roasted_stock
  for insert to authenticated
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'roaster'::app_role)
  );

-- roasted_stock: UPDATE admin and roaster
create policy "stock_update_admin_roaster" on roasted_stock
  for update to authenticated
  using (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'roaster'::app_role)
  );

-- roasted_stock: DELETE admin only
create policy "stock_delete_admin" on roasted_stock
  for delete to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

-- roasted_stock_history: SELECT all authenticated
create policy "stock_history_select_all" on roasted_stock_history
  for select to authenticated using (true);

-- roasted_stock_history: INSERT admin and roaster
-- Trigger runs as security definer and bypasses RLS for 'order_delivered' rows.
create policy "stock_history_insert_admin_roaster" on roasted_stock_history
  for insert to authenticated
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'roaster'::app_role)
  );

-- ── Trigger function ──────────────────────────────────────────────────────────
-- Fires AFTER UPDATE on orders when status changes to 'delivered'.
-- Decreases stock for every product in the order.
--
-- Column name audit:
--   order_items.quantity  (not quantity_kg — verified from schema)
--   orders has no updated_by column → last_updated_by set to NULL

create or replace function decrease_stock_on_delivery()
returns trigger as $$
declare
  item record;
  current_stock record;
begin
  if NEW.status = 'delivered' and OLD.status != 'delivered' then

    for item in
      select oi.product_id,
             sum(oi.quantity) as total_kg
      from order_items oi
      where oi.order_id = NEW.id
      group by oi.product_id
    loop
      select * into current_stock
      from roasted_stock
      where product_id = item.product_id;

      if found then
        insert into roasted_stock_history (
          stock_id,
          previous_quantity_kg,
          new_quantity_kg,
          delta_kg,
          change_type,
          order_id,
          note,
          updated_by
        ) values (
          current_stock.id,
          current_stock.quantity_kg,
          greatest(current_stock.quantity_kg - item.total_kg, 0),
          -item.total_kg,
          'order_delivered',
          NEW.id,
          'Auto-decreased on order delivery',
          NULL  -- orders has no updated_by column
        );

        update roasted_stock
        set
          quantity_kg     = greatest(quantity_kg - item.total_kg, 0),
          last_updated_by = NULL,
          last_updated_at = now()
        where product_id = item.product_id;
      end if;
    end loop;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_decrease_stock_on_delivery
  after update on orders
  for each row
  execute function decrease_stock_on_delivery();
