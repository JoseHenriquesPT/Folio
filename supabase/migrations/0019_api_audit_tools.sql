-- Audit viewer and undo for external writes (Phase 8.4).
--
-- The audit rows are owner-only. `list_api_audit` returns metadata and note
-- titles, never the before body; `undo_api_update` restores a note only when
-- its current version still matches the version the audited update produced.
-- The undo itself is audited as another external change.

create function public.list_api_audit(p_limit integer default 50)
returns table (
  id bigint,
  tool text,
  status text,
  note_ids uuid[],
  note_titles text[],
  summary jsonb,
  token_name text,
  token_prefix text,
  created_at timestamptz,
  can_undo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_owner
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.tool,
    a.status,
    a.note_ids,
    coalesce(
      (
        select pg_catalog.array_agg(n.title order by n.title)
        from public.notes n
        where n.id = any (a.note_ids)
      ),
      '{}'
    ) as note_titles,
    a.summary,
    t.name as token_name,
    t.prefix as token_prefix,
    a.created_at,
    (
      a.tool = 'update_note'
      and a.before_snapshot is not null
      and pg_catalog.cardinality(a.note_ids) = 1
      and exists (
        select 1
        from public.notes n
        where n.id = a.note_ids[1]
          and n.deleted_at is null
          and n.version = (a.summary ->> 'version_to')::integer
      )
    ) as can_undo
  from public.api_audit a
  left join public.api_tokens t on t.id = a.token_id
  where a.owner_id = (select auth.uid())
  order by a.created_at desc, a.id desc
  limit v_limit;
end;
$$;

create function public.undo_api_update(p_audit_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit public.api_audit%rowtype;
  v_current public.notes%rowtype;
  v_after public.notes%rowtype;
  v_before_title text;
  v_before_body text;
  v_current_snapshot jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_owner
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_audit
  from public.api_audit a
  where a.id = p_audit_id
    and a.owner_id = (select auth.uid())
    and a.tool = 'update_note'
    and a.status = 'ok'
    and a.before_snapshot is not null
    and pg_catalog.cardinality(a.note_ids) = 1;

  if not found then
    raise exception 'change not found or not undoable' using errcode = 'P0002';
  end if;

  select * into v_current
  from public.notes n
  where n.id = v_audit.note_ids[1]
  for update;

  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  if v_current.deleted_at is not null then
    raise exception 'trashed notes cannot be undone' using errcode = '55000';
  end if;
  if not public.can_edit_note(v_current.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_audit.summary ->> 'version_to' is null
     or v_current.version <> (v_audit.summary ->> 'version_to')::integer then
    raise exception 'the note changed since the external update'
      using errcode = '40001';
  end if;

  v_before_title := v_audit.before_snapshot ->> 'title';
  v_before_body := v_audit.before_snapshot ->> 'body_html';
  if v_before_title is null or v_before_body is null then
    raise exception 'the audit snapshot is incomplete' using errcode = 'P0002';
  end if;

  v_current_snapshot := pg_catalog.jsonb_build_object(
    'title', v_current.title,
    'body_html', v_current.body_html,
    'version', v_current.version
  );

  select * into v_after
  from public.save_note(
    v_current.id,
    v_current.version,
    v_before_title,
    v_before_body
  );

  perform public.api_record_audit(
    (select auth.uid()),
    v_audit.token_id,
    'undo_update',
    v_audit.note_ids,
    pg_catalog.jsonb_build_object(
      'undone_audit_id', v_audit.id,
      'title', v_after.title,
      'version_from', v_current.version,
      'version_to', v_after.version
    ),
    v_current_snapshot
  );

  return pg_catalog.jsonb_build_object(
    'id', v_after.id,
    'title', v_after.title,
    'version', v_after.version,
    'undone_audit_id', v_audit.id
  );
end;
$$;

revoke all on function public.list_api_audit(integer) from public, anon;
grant execute on function public.list_api_audit(integer) to authenticated;

revoke all on function public.undo_api_update(bigint) from public, anon;
grant execute on function public.undo_api_update(bigint) to authenticated;
