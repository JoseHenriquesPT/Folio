-- Attachment metadata and the private note-attachments storage bucket.

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(btrim(file_name)) > 0),
  mime_type text not null check (char_length(btrim(mime_type)) > 0),
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 20971520),
  created_at timestamptz not null default now(),
  constraint attachments_path_matches_note
    check (storage_path like note_id::text || '/%')
);

create index attachments_note_idx on public.attachments (note_id);

alter table public.attachments enable row level security;

create policy attachments_read on public.attachments
for select to authenticated
using (public.can_read_note(note_id));

create policy attachments_insert on public.attachments
for insert to authenticated
with check (
  public.can_edit_note(note_id)
  and owner_id = (select auth.uid())
);

create policy attachments_update on public.attachments
for update to authenticated
using (public.owns_note(note_id))
with check (public.owns_note(note_id));

create policy attachments_delete on public.attachments
for delete to authenticated
using (public.owns_note(note_id));

revoke all on public.attachments from anon, authenticated;
grant select, insert, update, delete on public.attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('note-attachments', 'note-attachments', false, 20971520)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

create function public.storage_note_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.split_part(object_name, '/', 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then pg_catalog.split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function public.storage_note_id(text) from public, anon;
grant execute on function public.storage_note_id(text) to authenticated;

drop policy if exists note_attachments_read on storage.objects;
drop policy if exists note_attachments_upload on storage.objects;
drop policy if exists note_attachments_delete on storage.objects;

create policy note_attachments_read on storage.objects
for select to authenticated
using (
  bucket_id = 'note-attachments'
  and public.can_read_note(public.storage_note_id(name))
);

create policy note_attachments_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'note-attachments'
  and public.can_edit_note(public.storage_note_id(name))
);

create policy note_attachments_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'note-attachments'
  and public.owns_note(public.storage_note_id(name))
);
