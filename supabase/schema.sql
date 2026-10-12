-- Splitbook storage. Every friend, expense, payment and the settings record is one row,
-- so adding from two devices never overwrites the other's changes.
create table if not exists public.items (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  kind       text not null check (kind in ('person', 'expense', 'payment', 'settings')),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Each signed-in user can only see and change their own rows.
alter table public.items enable row level security;

create policy "own rows: select" on public.items for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on public.items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on public.items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows: delete" on public.items for delete to authenticated using (user_id = (select auth.uid()));
