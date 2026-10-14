create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  check (subscription->>'endpoint' = endpoint)
);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from public, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "Users can view their own push subscriptions"
  on public.push_subscriptions;
create policy "Users can view their own push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own push subscriptions"
  on public.push_subscriptions;
create policy "Users can create their own push subscriptions"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own push subscriptions"
  on public.push_subscriptions;
create policy "Users can update their own push subscriptions"
  on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own push subscriptions"
  on public.push_subscriptions;
create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
