-- Notebook sharing. A share on a notebook covers the whole subtree: every
-- note in the notebook and in its sub-notebooks. Recipients edit note content
-- only (via save_note); note membership, tags, pin/archive/trash, attachment
-- records and re-sharing stay owner-only. Effective permission is the
-- strongest of the note-level and notebook-level grants.
--
-- Grants are written explicitly per the 0014 convention: hosted has no default
-- ACLs, so every function gets an explicit revoke and, where an API role needs
-- it, an explicit grant.

create table public.notebook_shares (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  shared_with uuid not null references public.profiles (id) on delete cascade,
  permission text not null check (permission in ('read', 'edit')),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notebook_shares_unique_recipient unique (notebook_id, shared_with)
);

create index notebook_shares_recipient_idx on public.notebook_shares (shared_with);
create index notebook_shares_created_by_idx on public.notebook_shares (created_by);

create trigger notebook_shares_touch_updated_at
before update on public.notebook_shares
for each row execute function public.touch_updated_at();

create function public.validate_notebook_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notebook_owner uuid;
begin
  select n.owner_id into notebook_owner
  from public.notebooks n
  where n.id = new.notebook_id;

  if not found then
    raise exception 'notebook does not exist' using errcode = '23503';
  end if;

  if new.shared_with = notebook_owner then
    raise exception 'cannot share a notebook with its owner' using errcode = 'P0001';
  end if;

  if new.created_by <> notebook_owner then
    raise exception 'share creator must be the notebook owner' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger notebook_shares_validate
before insert or update of notebook_id, shared_with, created_by on public.notebook_shares
for each row execute function public.validate_notebook_share();

-- The ancestor chain of a notebook, itself included. Internal machinery: it is
-- only ever called from security-definer functions (which run as the owner),
-- so API roles never receive EXECUTE.
create function public.notebook_ancestor_ids(target_notebook_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select n.id, n.parent_id
    from public.notebooks n
    where n.id = target_notebook_id
    union all
    select n.id, n.parent_id
    from public.notebooks n
    join chain c on n.id = c.parent_id
  )
  select id from chain
$$;

-- The strongest share permission the current user holds over a note, direct
-- or inherited from a shared ancestor notebook. Null when there is none; the
-- owner's own access is ownership, not a share.
create function public.my_note_share_permission(target_note_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select x.permission
  from (
    select s.permission
    from public.note_shares s
    where s.note_id = target_note_id
      and s.shared_with = (select auth.uid())
    union all
    select s.permission
    from public.notebook_shares s
    where s.shared_with = (select auth.uid())
      and s.notebook_id in (
        select * from public.notebook_ancestor_ids(
          (select n.notebook_id from public.notes n where n.id = target_note_id)
        )
      )
  ) as x
  order by case x.permission when 'edit' then 2 else 1 end desc
  limit 1
$$;

-- How many notebook shares grant access to a note, across its whole ancestor
-- chain. Owners use this to see which notes sit in a shared subtree.
create function public.notebook_share_count(target_note_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct s.shared_with)::integer
  from public.notebook_shares s
  where s.notebook_id in (
    select * from public.notebook_ancestor_ids(
      (select n.notebook_id from public.notes n where n.id = target_note_id)
    )
  )
$$;

create function public.owns_notebook(target_notebook_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notebooks n
    where n.id = target_notebook_id
      and n.owner_id = (select auth.uid())
  )
$$;

-- Share rows are visible only through the share relationship itself, so the
-- ancestor walk cannot run under the caller's RLS; this helper wraps it.
create function public.can_read_notebook(target_notebook_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.owns_notebook(target_notebook_id)
  or exists (
    select 1
    from public.notebook_shares s
    where s.shared_with = (select auth.uid())
      and s.notebook_id in (
        select * from public.notebook_ancestor_ids(target_notebook_id)
      )
  )
$$;

create or replace function public.can_read_note(target_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notes n
    where n.id = target_note_id
      and (
        n.owner_id = (select auth.uid())
        or (
          n.deleted_at is null
          and public.my_note_share_permission(target_note_id) is not null
        )
      )
  )
$$;

create or replace function public.can_edit_note(target_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notes n
    where n.id = target_note_id
      and n.deleted_at is null
      and (
        n.owner_id = (select auth.uid())
        or public.my_note_share_permission(target_note_id) = 'edit'
      )
  )
$$;

alter table public.notebook_shares enable row level security;

create policy notebook_shares_select on public.notebook_shares
for select to authenticated
using (
  shared_with = (select auth.uid())
  or public.owns_notebook(notebook_id)
);

create policy notebook_shares_insert on public.notebook_shares
for insert to authenticated
with check (
  public.owns_notebook(notebook_id)
  and created_by = (select auth.uid())
);

create policy notebook_shares_update on public.notebook_shares
for update to authenticated
using (public.owns_notebook(notebook_id))
with check (
  public.owns_notebook(notebook_id)
  and created_by = (select auth.uid())
);

create policy notebook_shares_delete on public.notebook_shares
for delete to authenticated
using (public.owns_notebook(notebook_id));

-- Recipients can read the shared subtree so their sidebar can show it. Only
-- select: writes stay with the owner's notebooks_owner_all policy.
create policy notebooks_shared_read on public.notebooks
for select to authenticated
using (public.can_read_notebook(id));

-- Cards need the inherited permission and how many people reach the note
-- through a shared subtree.
create or replace view public.note_summaries
with (security_invoker = true)
as
select
  n.id,
  n.owner_id,
  n.notebook_id,
  n.title,
  n.body_html,
  n.body_text,
  n.search,
  n.pinned,
  n.archived,
  n.deleted_at,
  n.version,
  n.last_edited_by,
  n.created_at,
  n.updated_at,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)
        order by t.name
      )
      from public.note_tags nt
      join public.tags t on t.id = nt.tag_id
      where nt.note_id = n.id
    ),
    '[]'::jsonb
  ) as tags,
  coalesce(
    (
      select array_agg(nt.tag_id)
      from public.note_tags nt
      where nt.note_id = n.id
    ),
    '{}'::uuid[]
  ) as tag_ids,
  (
    select count(*)::integer
    from public.attachments a
    where a.note_id = n.id
  ) as attachment_count,
  (
    select count(*)::integer
    from public.note_shares s
    where s.note_id = n.id
  ) as share_count,
  coalesce(
    (
      select array_agg(s.shared_with)
      from public.note_shares s
      where s.note_id = n.id
    ),
    '{}'::uuid[]
  ) as share_recipients,
  (
    select p.display_name
    from public.public_profiles p
    where p.id = n.owner_id
  ) as owner_display_name,
  public.my_note_share_permission(n.id) as my_share_permission,
  public.notebook_share_count(n.id) as notebook_share_count
from public.notes n;

-- Recipients resolve the owner's name, and owners resolve their recipients'.
drop policy profiles_select_identity on public.profiles;

create policy profiles_select_identity on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    -- A note is shared with me; this row is that note's owner.
    select 1
    from public.note_shares s
    join public.notes n on n.id = s.note_id
    where s.shared_with = (select auth.uid())
      and n.owner_id = profiles.id
  )
  or exists (
    -- I own a note shared with this user.
    select 1
    from public.note_shares s
    where s.shared_with = profiles.id
      and public.owns_note(s.note_id)
  )
  or exists (
    -- A notebook is shared with me; this row is its owner.
    select 1
    from public.notebook_shares s
    join public.notebooks nb on nb.id = s.notebook_id
    where s.shared_with = (select auth.uid())
      and nb.owner_id = profiles.id
  )
  or exists (
    -- I own a notebook shared with this user.
    select 1
    from public.notebook_shares s
    where s.shared_with = profiles.id
      and public.owns_notebook(s.notebook_id)
  )
);

-- Share changes broadcast like note shares do.
alter table public.notebook_shares replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notebook_shares'
  ) then
    alter publication supabase_realtime add table public.notebook_shares;
  end if;
end $$;

revoke all on public.notebook_shares from anon, authenticated;
grant select, insert, update, delete on public.notebook_shares to authenticated;

revoke all on function public.validate_notebook_share() from public, anon, authenticated;
revoke all on function public.notebook_ancestor_ids(uuid) from public, anon, authenticated;

revoke all on function public.owns_notebook(uuid) from public, anon;
grant execute on function public.owns_notebook(uuid) to authenticated;

revoke all on function public.can_read_notebook(uuid) from public, anon;
grant execute on function public.can_read_notebook(uuid) to authenticated;

revoke all on function public.my_note_share_permission(uuid) from public, anon;
grant execute on function public.my_note_share_permission(uuid) to authenticated;

revoke all on function public.notebook_share_count(uuid) from public, anon;
grant execute on function public.notebook_share_count(uuid) to authenticated;

revoke all on function public.can_read_note(uuid) from public, anon;
grant execute on function public.can_read_note(uuid) to authenticated;
revoke all on function public.can_edit_note(uuid) from public, anon;
grant execute on function public.can_edit_note(uuid) to authenticated;
