-- Extra protection on top of row level security. Safe to run more than once.

-- 1. Anonymous visitors get no access to the table at all, even if RLS were ever
--    switched off by mistake. Signed-in users get only the four operations the app uses.
revoke all on table public.items from anon;
revoke all on table public.items from authenticated;
grant select, insert, update, delete on table public.items to authenticated;

-- 2. Reject malformed or oversized records at the database level.
alter table public.items drop constraint if exists items_id_format;
alter table public.items add constraint items_id_format check (id ~ '^[a-z0-9]{1,32}$');
alter table public.items drop constraint if exists items_data_size;
alter table public.items add constraint items_data_size check (pg_column_size(data) <= 8192);
