-- Pump & Solar Stock: database setup for Supabase.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
-- Safe to run again: it only creates what is missing and replaces functions and policies.

-- ---------------------------------------------------------------------------
-- People and roles
-- ---------------------------------------------------------------------------
-- admin     : everything, including settings, catalogue and team
-- warehouse : stock, receiving goods, serial numbers, stock counts (no prices in the app)
-- billing   : sales, invoices, e-invoice, payments, customers and suppliers
-- A new account has no role and sees nothing until an admin gives it one.
-- The very first account created becomes an admin.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  role       text check (role in ('admin', 'warehouse', 'billing')),
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles where role = 'admin') then null else 'admin' end
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that existed before this script ran get a profile too (the oldest becomes admin if there is none).
insert into public.profiles (user_id, email, name, role)
select u.id, u.email, split_part(u.email, '@', 1), null
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id);

update public.profiles set role = 'admin'
where user_id = (select user_id from public.profiles order by created_at, user_id limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

-- Never leave the team without an admin.
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.role = 'admin') or (tg_op = 'UPDATE' and old.role = 'admin' and new.role is distinct from 'admin') then
    if not exists (select 1 from public.profiles where role = 'admin' and user_id <> old.user_id) then
      raise exception 'At least one admin is needed. Make someone else an admin first.';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists profiles_keep_one_admin on public.profiles;
create trigger profiles_keep_one_admin
  before update or delete on public.profiles
  for each row execute function public.keep_one_admin();

alter table public.profiles enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin');

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Business data
-- ---------------------------------------------------------------------------
-- One table of JSON documents, grouped by collection: products, receipts, invoices,
-- adjustments, parties, payments, settings. Stock is worked out in the app from
-- receipts, adjustments and invoices, so no counter can drift.

create table if not exists public.docs (
  collection text not null,
  id         text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);

create or replace function public.docs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs
  for each row execute function public.docs_touch();

-- Who may create or change documents in each collection.
create or replace function public.can_write(p_collection text, p_data jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'warehouse' then p_collection in ('receipts', 'adjustments')
                       or (p_collection = 'parties' and p_data ->> 'type' = 'supplier')
    when 'billing' then p_collection in ('invoices', 'payments', 'parties', 'receipts')
    else false
  end
$$;

create or replace function public.can_delete(p_collection text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'billing' then p_collection = 'payments'
    else false
  end
$$;

alter table public.docs enable row level security;

drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated
  using (public.my_role() is not null);

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated
  with check (public.can_write(collection, data));

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
  using (public.can_write(collection, data))
  with check (public.can_write(collection, data));

drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to authenticated
  using (public.can_delete(collection));

-- Merge-update used by the app ("update these fields, keep the rest"). Runs with the
-- caller's rights, so the policies above still apply.
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(k,
        case when a ? k and b ? k then public.jsonb_deep_merge(a -> k, b -> k)
             when b ? k then b -> k
             else a -> k end), '{}'::jsonb)
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) keys)
    else b
  end
$$;

create or replace function public.doc_update(p_collection text, p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.docs
     set data = public.jsonb_deep_merge(data, p_patch)
   where collection = p_collection and id = p_id;
  if not found then
    raise exception 'Document not found, or your role cannot change it' using errcode = 'P0002';
  end if;
end $$;

grant select, insert, update, delete on public.docs to authenticated;
grant select, update on public.profiles to authenticated;
grant execute on function public.doc_update(text, text, jsonb) to authenticated;
grant execute on function public.my_role() to authenticated;

-- Live updates: every open app sees changes from the others straight away.
alter table public.docs replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
