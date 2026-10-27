-- Per-note sharing, the read/edit helpers used by RLS, and save_note.

create table public.note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  shared_with uuid not null references public.profiles (id) on delete cascade,
  permission text not null check (permission in ('read', 'edit')),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_shares_unique_recipient unique (note_id, shared_with)
);

create index note_shares_recipient_idx on public.note_shares (shared_with);

create trigger note_shares_touch_updated_at
before update on public.note_shares
for each row execute function public.touch_updated_at();

create function public.validate_note_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  note_owner uuid;
begin
  select n.owner_id into note_owner
  from public.notes n
  where n.id = new.note_id;

  if not found then
    raise exception 'note does not exist' using errcode = '23503';
  end if;

  if new.shared_with = note_owner then
    raise exception 'cannot share a note with its owner' using errcode = 'P0001';
  end if;

  if new.created_by <> note_owner then
    raise exception 'share creator must be the note owner' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger note_shares_validate
before insert or update of note_id, shared_with, created_by on public.note_shares
for each row execute function public.validate_note_share();

create function public.can_read_note(target_note_id uuid)
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
      and n.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.notes n
    join public.note_shares s on s.note_id = n.id
    where n.id = target_note_id
      and n.deleted_at is null
      and s.shared_with = auth.uid()
  );
$$;

create function public.can_edit_note(target_note_id uuid)
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
      and n.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.notes n
    join public.note_shares s on s.note_id = n.id
    where n.id = target_note_id
      and n.deleted_at is null
      and s.permission = 'edit'
      and s.shared_with = auth.uid()
  );
$$;

revoke all on function public.can_read_note(uuid) from public, anon;
revoke all on function public.can_edit_note(uuid) from public, anon;
grant execute on function public.can_read_note(uuid) to authenticated;
grant execute on function public.can_edit_note(uuid) to authenticated;

create function public.save_note(
  target_note_id uuid,
  expected_version integer,
  new_title text,
  new_body_html text
)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored public.notes;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select n.* into stored
  from public.notes n
  where n.id = target_note_id
  for update;

  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  if stored.deleted_at is not null then
    raise exception 'trashed notes cannot be saved' using errcode = '55000';
  end if;

  if not public.can_edit_note(target_note_id) then
    raise exception 'not allowed to edit this note' using errcode = '42501';
  end if;

  if stored.version <> expected_version then
    raise exception 'version conflict' using errcode = '40001';
  end if;

  update public.notes
     set title = coalesce(new_title, ''),
         body_html = coalesce(new_body_html, ''),
         version = stored.version + 1,
         last_edited_by = auth.uid()
   where id = target_note_id
   returning * into stored;

  return stored;
end;
$$;

revoke all on function public.save_note(uuid, integer, text, text) from public, anon;
grant execute on function public.save_note(uuid, integer, text, text) to authenticated;

alter table public.note_shares enable row level security;

create policy note_shares_select on public.note_shares
for select to authenticated
using (
  shared_with = (select auth.uid())
  or public.owns_note(note_id)
);

create policy note_shares_insert on public.note_shares
for insert to authenticated
with check (
  public.owns_note(note_id)
  and created_by = (select auth.uid())
);

create policy note_shares_update on public.note_shares
for update to authenticated
using (public.owns_note(note_id))
with check (
  public.owns_note(note_id)
  and created_by = (select auth.uid())
);

create policy note_shares_delete on public.note_shares
for delete to authenticated
using (public.owns_note(note_id));

revoke all on public.note_shares from anon, authenticated;
grant select, insert, update, delete on public.note_shares to authenticated;

drop policy notes_owner_select on public.notes;

create policy notes_read on public.notes
for select to authenticated
using (public.can_read_note(id));
