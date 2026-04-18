-- ── Google Sheets export tracking ────────────────────────────────────────────

-- Stamp orders when they are included in a sheet export
alter table orders
  add column if not exists exported_to_sheet_at timestamptz default null;

-- One row per month — stores the spreadsheet ID so we can update the same
-- sheet on subsequent exports instead of creating a new one each time.
create table sheet_exports (
  id              uuid primary key default gen_random_uuid(),
  month_key       text not null unique,          -- e.g. "2026-04"
  spreadsheet_id  text not null,
  spreadsheet_url text not null,
  orders_count    int  not null default 0,
  last_exported_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table sheet_exports enable row level security;

-- admin only: select, insert, update
create policy "sheet_exports_admin"
  on sheet_exports for all
  to authenticated
  using   (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));
