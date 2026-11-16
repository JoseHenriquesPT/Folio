-- Write external tools (Phase 8.3).
--
-- Every function authenticates a write-scoped token, sets the request claims to
-- the token's account, and applies the same matrix as the app: content edits
-- for the owner or an edit share; structural changes (move, tags, notebooks)
-- owner-only. Content updates go through save_note (version checked). Every
-- successful call is recorded in api_audit, with a before snapshot for updates.
-- There are no sharing, trash, permanent delete, attachment deletion or
-- pin/archive tools. Grants are anon-only; authenticated is revoked.

-- ---------------------------------------------------------------------------
-- Internal helpers.
-- ---------------------------------------------------------------------------

create function public.api_record_audit(
  p_owner_id uuid,
  p_token_id uuid,
  p_tool text,
  p_note_ids uuid[],
  p_summary jsonb default '{}'::jsonb,
  p_before_snapshot jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.api_audit
    (owner_id, token_id, tool, status, note_ids, summary, before_snapshot)
  values
    (p_owner_id, p_token_id, p_tool, 'ok', coalesce(p_note_ids, '{}'),
     coalesce(p_summary, '{}'::jsonb), p_before_snapshot);
$$;

create function public.api_upsert_tag(p_owner_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if pg_catalog.char_length(v_name) < 1
     or pg_catalog.char_length(v_name) > 60 then
    raise exception 'tag name must be between 1 and 60 characters'
      using errcode = '22023';
  end if;

  select t.id into v_id
  from public.tags t
  where t.owner_id = p_owner_id
    and pg_catalog.lower(pg_catalog.btrim(t.name)) =
        pg_catalog.lower(v_name);

  if found then
    return v_id;
  end if;

  begin
    insert into public.tags (owner_id, name)
    values (p_owner_id, v_name)
    returning id into v_id;
  exception when unique_violation then
    select t.id into v_id
    from public.tags t
    where t.owner_id = p_owner_id
      and pg_catalog.lower(pg_catalog.btrim(t.name)) =
          pg_catalog.lower(v_name);
  end;

  if v_id is null then
    raise exception 'tag could not be created' using errcode = '22023';
  end if;

  return v_id;
end;
$$;

create function public.api_require_owned_notes(p_note_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_note_ids is null
     or pg_catalog.cardinality(p_note_ids) not between 1 and 100 then
    raise exception 'note_ids must contain 1 to 100 ids'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_note_ids) x(id)
    where not public.owns_note(x.id)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.api_record_audit(
  uuid, uuid, text, uuid[], jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.api_upsert_tag(uuid, text)
  from public, anon, authenticated;
revoke all on function public.api_require_owned_notes(uuid[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notes.
-- ---------------------------------------------------------------------------

create function public.api_create_note(
  p_title text,
  p_body_html text,
  p_notebook_id uuid default null,
  p_tags text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_token uuid;
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_body text := coalesce(p_body_html, '');
  v_note public.notes%rowtype;
  v_tag text;
  v_tag_id uuid;
  v_tags text[];
begin
  select a.owner_id, a.token_id into v_actor, v_token
  from public.api_authenticate('write') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  if pg_catalog.char_length(v_title) > 500 then
    raise exception 'title must be 500 characters or fewer'
      using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_body) > 1000000 then
    raise exception 'body is too large' using errcode = '22023';
  end if;
  if v_title = '' and public.html_to_text(v_body) = '' then
    raise exception 'the note needs a title or body' using errcode = '22023';
  end if;

  if p_notebook_id is not null and not public.owns_notebook(p_notebook_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_tags is not null and pg_catalog.cardinality(p_tags) > 20 then
    raise exception 'at most 20 tags are allowed' using errcode = '22023';
  end if;

  insert into public.notes (owner_id, notebook_id, title, body_html)
  values (v_actor, p_notebook_id, v_title, v_body)
  returning * into v_note;

  if p_tags is not null then
    foreach v_tag in array p_tags loop
      v_tag_id := public.api_upsert_tag(v_actor, v_tag);
      insert into public.note_tags (note_id, tag_id)
      values (v_note.id, v_tag_id)
      on conflict do nothing;
    end loop;
  end if;

  select coalesce(pg_catalog.array_agg(t.name order by t.name), '{}')
  into v_tags
  from public.note_tags nt
  join public.tags t on t.id = nt.tag_id
  where nt.note_id = v_note.id;

  perform public.api_record_audit(
    v_actor, v_token, 'create_note', array[v_note.id],
    pg_catalog.jsonb_build_object(
      'title', v_note.title,
      'notebook_id', v_note.notebook_id,
      'tags', v_tags
    ),
    null
  );

  return pg_catalog.jsonb_build_object(
    'id', v_note.id,
    'title', v_note.title,
    'version', v_note.version,
    'notebook_id', v_note.notebook_id,
    'tags', v_tags,
    'created_at', v_note.created_at,
    'updated_at', v_note.updated_at
  );
end;
$$;

create function public.api_update_note(
  p_note_id uuid,
  p_expected_version integer,
  p_title text default null,
  p_body_html text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_token uuid;
  v_before public.notes%rowtype;
  v_after public.notes%rowtype;
  v_before_snapshot jsonb;
begin
  select a.owner_id, a.token_id into v_actor, v_token
  from public.api_authenticate('write') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  if p_title is null and p_body_html is null then
    raise exception 'title or body_html is required' using errcode = '22023';
  end if;
  if p_title is not null and pg_catalog.char_length(p_title) > 500 then
    raise exception 'title must be 500 characters or fewer'
      using errcode = '22023';
  end if;
  if p_body_html is not null and pg_catalog.char_length(p_body_html) > 1000000 then
    raise exception 'body is too large' using errcode = '22023';
  end if;

  select * into v_before
  from public.notes n
  where n.id = p_note_id
  for update;

  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  if v_before.deleted_at is not null then
    raise exception 'trashed notes cannot be saved' using errcode = '55000';
  end if;
  if not public.can_edit_note(p_note_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_before_snapshot := pg_catalog.jsonb_build_object(
    'title', v_before.title,
    'body_html', v_before.body_html,
    'version', v_before.version
  );

  select * into v_after
  from public.save_note(
    p_note_id,
    p_expected_version,
    coalesce(p_title, v_before.title),
    coalesce(p_body_html, v_before.body_html)
  );

  perform public.api_record_audit(
    v_actor, v_token, 'update_note', array[p_note_id],
    pg_catalog.jsonb_build_object(
      'title', v_after.title,
      'version_from', v_before.version,
      'version_to', v_after.version
    ),
    v_before_snapshot
  );

  return pg_catalog.jsonb_build_object(
    'id', v_after.id,
    'title', v_after.title,
    'version', v_after.version,
    'updated_at', v_after.updated_at
  );
end;
$$;

create function public.api_move_notes(
  p_note_ids uuid[],
  p_notebook_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_token uuid;
  v_count integer;
begin
  select a.owner_id, a.token_id into v_actor, v_token
  from public.api_authenticate('write') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  perform public.api_require_owned_notes(p_note_ids);

  if p_notebook_id is not null and not public.owns_notebook(p_notebook_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.notes
     set notebook_id = p_notebook_id
   where id = any (p_note_ids);
  get diagnostics v_count = row_count;

  perform public.api_record_audit(
    v_actor, v_token, 'move_notes', p_note_ids,
    pg_catalog.jsonb_build_object('notebook_id', p_notebook_id),
    null
  );

  return pg_catalog.jsonb_build_object(
    'moved', v_count,
    'note_ids', p_note_ids
  );
end;
$$;

create function public.api_add_tags(
  p_note_ids uuid[],
  p_tags text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_token uuid;
  v_note_id uuid;
  v_tag text;
  v_tag_id uuid;
  v_names text[];
begin
  select a.owner_id, a.token_id into v_actor, v_token
  from public.api_authenticate('write') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  perform public.api_require_owned_notes(p_note_ids);
  if p_tags is null
     or pg_catalog.cardinality(p_tags) not between 1 and 20 then
    raise exception 'tags must contain 1 to 20 names'
      using errcode = '22023';
  end if;

  foreach v_note_id in array p_note_ids loop
    foreach v_tag in array p_tags loop
      v_tag_id := public.api_upsert_tag(v_actor, v_tag);
      insert into public.note_tags (note_id, tag_id)
      values (v_note_id, v_tag_id)
      on conflict do nothing;
    end loop;
  end loop;

  select coalesce(pg_catalog.array_agg(distinct t.name order by t.name), '{}')
  into v_names
  from public.tags t
  where t.owner_id = v_actor
    and pg_catalog.lower(pg_catalog.btrim(t.name)) = any (
      select pg_catalog.lower(pg_catalog.btrim(x.name))
      from pg_catalog.unnest(p_tags) x(name)
    );

  perform public.api_record_audit(
    v_actor, v_token, 'add_tags', p_note_ids,
    pg_catalog.jsonb_build_object('tags', v_names),
    null
  );

  return pg_catalog.jsonb_build_object(
    'updated', pg_catalog.cardinality(p_note_ids),
    'tags', v_names
  );
end;
$$;

create function public.api_remove_tags(
  p_note_ids uuid[],
  p_tags text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_token uuid;
  v_count integer;
begin
  select a.owner_id, a.token_id into v_actor, v_token
  from public.api_authenticate('write') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  perform public.api_require_owned_notes(p_note_ids);
  if p_tags is null
     or pg_catalog.cardinality(p_tags) not between 1 and 20 then
    raise exception 'tags must contain 1 to 20 names'
      using errcode = '22023';
  end if;

  delete from public.note_tags nt
  using public.tags t
  where nt.note_id = any (p_note_ids)
    and nt.tag_id = t.id
    and t.owner_id = v_actor
    and pg_catalog.lower(pg_catalog.btrim(t.name)) = any (
      select pg_catalog.lower(pg_catalog.btrim(x.name))
      from pg_catalog.unnest(p_tags) x(name)
    );
  get diagnostics v_count = row_count;

  perform public.api_record_audit(
    v_actor, v_token, 'remove_tags', p_note_ids,
    pg_catalog.jsonb_build_object('tags', p_tags),
    null
  );

  return pg_catalog.jsonb_build_object(
    'updated', pg_catalog.cardinality(p_note_ids),
    'removed', v_count,
    'tags', p_tags
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Notebooks.
-- ---------------------------------------------------------------------------

create function public.api_create_notebook(
  p_name text,
  p_parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_token uuid;
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_position integer;
  v_notebook public.notebooks%rowtype;
begin
  select a.owner_id, a.token_id into v_actor, v_token
  from public.api_authenticate('write') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  if pg_catalog.char_length(v_name) < 1
     or pg_catalog.char_length(v_name) > 120 then
    raise exception 'notebook name must be between 1 and 120 characters'
      using errcode = '22023';
  end if;

  if p_parent_id is not null and not public.owns_notebook(p_parent_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.max(n.position), -1) + 1
  into v_position
  from public.notebooks n
  where n.owner_id = v_actor
    and n.parent_id is not distinct from p_parent_id;

  insert into public.notebooks (owner_id, parent_id, name, position)
  values (v_actor, p_parent_id, v_name, v_position)
  returning * into v_notebook;

  perform public.api_record_audit(
    v_actor, v_token, 'create_notebook', '{}',
    pg_catalog.jsonb_build_object(
      'notebook_id', v_notebook.id,
      'name', v_notebook.name,
      'parent_id', v_notebook.parent_id
    ),
    null
  );

  return pg_catalog.jsonb_build_object(
    'id', v_notebook.id,
    'name', v_notebook.name,
    'parent_id', v_notebook.parent_id,
    'position', v_notebook.position
  );
end;
$$;

create function public.api_rename_notebook(
  p_notebook_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_token uuid;
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_notebook public.notebooks%rowtype;
begin
  select a.owner_id, a.token_id into v_actor, v_token
  from public.api_authenticate('write') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  if pg_catalog.char_length(v_name) < 1
     or pg_catalog.char_length(v_name) > 120 then
    raise exception 'notebook name must be between 1 and 120 characters'
      using errcode = '22023';
  end if;

  if not public.owns_notebook(p_notebook_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.notebooks
     set name = v_name
   where id = p_notebook_id
  returning * into v_notebook;

  perform public.api_record_audit(
    v_actor, v_token, 'rename_notebook', '{}',
    pg_catalog.jsonb_build_object(
      'notebook_id', v_notebook.id,
      'name', v_notebook.name
    ),
    null
  );

  return pg_catalog.jsonb_build_object(
    'id', v_notebook.id,
    'name', v_notebook.name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: write tools are anon-only; the token is the credential.
-- ---------------------------------------------------------------------------

revoke all on function public.api_create_note(text, text, uuid, text[])
  from public, authenticated;
grant execute on function public.api_create_note(text, text, uuid, text[])
  to anon;

revoke all on function public.api_update_note(uuid, integer, text, text)
  from public, authenticated;
grant execute on function public.api_update_note(uuid, integer, text, text)
  to anon;

revoke all on function public.api_move_notes(uuid[], uuid)
  from public, authenticated;
grant execute on function public.api_move_notes(uuid[], uuid) to anon;

revoke all on function public.api_add_tags(uuid[], text[])
  from public, authenticated;
grant execute on function public.api_add_tags(uuid[], text[]) to anon;

revoke all on function public.api_remove_tags(uuid[], text[])
  from public, authenticated;
grant execute on function public.api_remove_tags(uuid[], text[]) to anon;

revoke all on function public.api_create_notebook(text, uuid)
  from public, authenticated;
grant execute on function public.api_create_notebook(text, uuid) to anon;

revoke all on function public.api_rename_notebook(uuid, text)
  from public, authenticated;
grant execute on function public.api_rename_notebook(uuid, text) to anon;
