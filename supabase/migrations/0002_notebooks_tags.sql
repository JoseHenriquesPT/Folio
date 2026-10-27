-- Notebooks (nested) and tags. note_tags lands in 0003 because it references notes.

create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id uuid references public.notebooks (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notebooks_owner_position_idx
  on public.notebooks (owner_id, position, created_at);
create index notebooks_parent_idx on public.notebooks (parent_id);

create trigger notebooks_touch_updated_at
before update on public.notebooks
for each row execute function public.touch_updated_at();

create function public.validate_notebook_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_owner uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'notebook parent cannot be itself' using errcode = '23514';
  end if;

  select n.owner_id into parent_owner
  from public.notebooks n
  where n.id = new.parent_id;

  if not found then
    raise exception 'notebook parent does not exist' using errcode = '23503';
  end if;

  if parent_owner <> new.owner_id then
    raise exception 'notebook parent belongs to another owner' using errcode = '42501';
  end if;

  if exists (
    with recursive ancestors as (
      select n.id, n.parent_id
      from public.notebooks n
      where n.id = new.parent_id
      union all
      select n.id, n.parent_id
      from public.notebooks n
      join ancestors a on n.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'notebook parent creates a cycle' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger notebooks_validate_parent
before insert or update of parent_id, owner_id on public.notebooks
for each row execute function public.validate_notebook_parent();

alter table public.notebooks enable row level security;

create policy notebooks_owner_all on public.notebooks
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

revoke all on public.notebooks from anon, authenticated;
grant select, insert, update, delete on public.notebooks to authenticated;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tags_owner_name_lower_idx
  on public.tags (owner_id, lower(btrim(name)));
create index tags_owner_idx on public.tags (owner_id, name);

create trigger tags_touch_updated_at
before update on public.tags
for each row execute function public.touch_updated_at();

alter table public.tags enable row level security;

create policy tags_owner_all on public.tags
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

revoke all on public.tags from anon, authenticated;
grant select, insert, update, delete on public.tags to authenticated;
