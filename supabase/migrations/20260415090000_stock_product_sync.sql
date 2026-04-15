-- Trigger: auto-create a stock row when a new product is inserted
create or replace function create_stock_row_on_new_product()
returns trigger as $$
begin
  insert into roasted_stock (product_id, quantity_kg, low_stock_threshold_kg)
  values (NEW.id, 0, 5)
  on conflict (product_id) do nothing;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_create_stock_on_product_insert
  after insert on products
  for each row
  execute function create_stock_row_on_new_product();

-- Backfill (run separately after confirmation):
-- insert into roasted_stock (product_id, quantity_kg, low_stock_threshold_kg)
-- select p.id, 0, 5
-- from products p
-- left join roasted_stock rs on rs.product_id = p.id
-- where rs.id is null;
