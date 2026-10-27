-- Profiles mirror auth.users. Display names are readable through the
-- public_profiles view; exact email lookup goes through an RPC.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lowercase check (email = lower(email))
);

comment on table public.profiles is
  'One row per auth user. Email is private; display names are exposed via public_profiles.';

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
begin
  candidate_name := coalesce(
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );

  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    pg_catalog.lower(coalesce(
      nullif(new.email, ''),
      new.id::text || '@local.invalid'
    )),
    candidate_name
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_auth_user();

insert into public.profiles (id, email, display_name)
select
  u.id,
  pg_catalog.lower(coalesce(
    nullif(u.email, ''),
    u.id::text || '@local.invalid'
  )),
  coalesce(
    nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(pg_catalog.split_part(coalesce(u.email, ''), '@', 1), ''),
    'User'
  )
from auth.users u
on conflict (id) do nothing;

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated
using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Intentionally bypasses profiles RLS: it exposes only id and display_name,
-- which is the one cross-user identity surface the share UI needs.
create view public.public_profiles
with (security_invoker = false)
as
select id, display_name
from public.profiles;

comment on view public.public_profiles is
  'The only cross-user identity surface: id and display name, for share UI.';

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

create function public.find_profile_by_email(candidate_email text)
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.profiles p
  where p.email = pg_catalog.lower(pg_catalog.btrim(candidate_email))
  limit 1;
$$;

revoke all on function public.find_profile_by_email(text) from public, anon;
grant execute on function public.find_profile_by_email(text) to authenticated;
