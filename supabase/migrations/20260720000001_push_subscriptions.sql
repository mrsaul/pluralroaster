-- supabase/migrations/20260720000001_push_subscriptions.sql

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- Index for the edge function: it selects all rows to fan-out
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

-- RLS: users manage only their own subscriptions; service role bypasses RLS automatically
alter table public.push_subscriptions enable row level security;

create policy if not exists "users can insert own subscription"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy if not exists "users can delete own subscription"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

create policy if not exists "users can select own subscription"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Explicit grants so RLS policies are evaluated (Supabase default, stated for safety)
grant select, insert, delete on public.push_subscriptions to authenticated;
