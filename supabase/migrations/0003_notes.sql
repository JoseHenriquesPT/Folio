-- Notes, derived plain text/search, owner-only table access, and note_tags.

create extension if not exists pg_trgm with schema extensions;

create function public.html_to_text(html text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  regexp_replace(coalesce(html, ''), '<[^>]*>', ' ', 'g'),
                  '&nbsp;', ' '
                ),
                '&lt;', '<'
              ),
              '&gt;', '>'
            ),
            '&quot;', '"'
          ),
          '&#39;', ''''
        ),
        '&amp;', '&'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  notebook_id uuid references public.notebooks (id) on delete set null,
  title text not null default '',
  body_html text not null default '',
  body_text text not null default '',
  search tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '') || ' ' || coalesce(body_text, '')
    )
  ) stored,
  pinned boolean not null default false,
  archived boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1 check (version >= 1),
  last_edited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_owner_updated_idx
  on public.notes (owner_id, updated_at desc)
  where deleted_at is null;
create index notes_notebook_idx
  on public.notes (notebook_id)
  where deleted_at is null;
create index notes_trash_idx
  on public.notes (owner_id, deleted_at desc)
  where deleted_at is not null;
create index notes_search_idx on public.notes using gin (search);
create index notes_title_trgm_idx
  on public.notes using gin (title extensions.gin_trgm_ops);
create index notes_body_text_trgm_idx
  on public.notes using gin (body_text extensions.gin_trgm_ops);

create function public.prepare_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := coalesce(new.title, '');
  new.body_html := coalesce(new.body_html, '');
  new.body_text := public.html_to_text(new.body_html);
  new.updated_at := pg_catalog.now();

  if tg_op = 'INSERT' then
    new.last_edited_by := coalesce(new.last_edited_by, new.owner_id);
  end if;

  return new;
end;
$$;

create trigger notes_prepare
before insert or update on public.notes
for each row execute function public.prepare_note();

create function public.validate_note_notebook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notebook_owner uuid;
begin
  if new.notebook_id is null then
    return new;
  end if;

  select n.owner_id into notebook_owner
  from public.notebooks n
  where n.id = new.notebook_id;

  if not found then
    raise exception 'notebook does not exist' using errcode = '23503';
  end if;

  if notebook_owner <> new.owner_id then
    raise exception 'notebook belongs to another owner' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger notes_validate_notebook
before insert or update of notebook_id, owner_id on public.notes
for each row execute function public.validate_note_notebook();

alter table public.notes enable row level security;

create policy notes_owner_select on public.notes
for select to authenticated
using (owner_id = (select auth.uid()));

create policy notes_owner_insert on public.notes
for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy notes_owner_update on public.notes
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy notes_owner_delete on public.notes
for delete to authenticated
using (owner_id = (select auth.uid()));

revoke all on public.notes from anon, authenticated;
grant select, insert, update, delete on public.notes to authenticated;

create function public.owns_note(target_note_id uuid)
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
  );
$$;

revoke all on function public.owns_note(uuid) from public, anon;
grant execute on function public.owns_note(uuid) to authenticated;

create table public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create index note_tags_tag_idx on public.note_tags (tag_id);

alter table public.note_tags enable row level security;

create policy note_tags_owner_all on public.note_tags
for all to authenticated
using (public.owns_note(note_id))
with check (
  public.owns_note(note_id)
  and exists (
    select 1
    from public.tags t
    where t.id = tag_id
      and t.owner_id = (select auth.uid())
  )
);

revoke all on public.note_tags from anon, authenticated;
grant select, insert, update, delete on public.note_tags to authenticated;
