-- External access is per account (Phase 8.5).
--
-- 0016 introduced a single-owner gate: only the first profile could manage
-- tokens. That model is removed. Every signed-in account manages only its own
-- tokens; no management RPC accepts an account id, and every query filters on
-- auth.uid(). The tool RPCs already resolve the account from the token and
-- filter with can_read_note / can_edit_note / owns_*, so a token sees exactly
-- what its account sees (owned plus shared data) and nothing else.
--
-- The is_owner flag and its first-profile trigger are dropped: access is now
-- authentication, not a global role, so there is no dead role flag to misuse.

create or replace function public.can_manage_api_tokens()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null;
$$;

create or replace function public.create_api_token(
  p_name text,
  p_scope text,
  p_expires_at timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  token text,
  prefix text,
  scope text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_token text;
  v_hash text;
  v_prefix text;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_name) < 1
     or pg_catalog.char_length(v_name) > 80 then
    raise exception 'name must be between 1 and 80 characters'
      using errcode = '22023';
  end if;

  if p_scope is null or p_scope not in ('read', 'write') then
    raise exception 'scope must be read or write' using errcode = '22023';
  end if;

  if p_expires_at is null
     or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '365 days' then
    raise exception 'expiry must be in the next 365 days'
      using errcode = '22023';
  end if;

  v_token := 'folio_pat_' ||
    pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_prefix := pg_catalog.left(v_token, 16);

  insert into public.api_tokens
    (owner_id, name, token_hash, prefix, scope, expires_at)
  values
    (v_owner, v_name, v_hash, v_prefix, p_scope, p_expires_at)
  returning public.api_tokens.id into v_id;

  return query
  select v_id, v_token, v_prefix, p_scope, p_expires_at;
end;
$$;

create or replace function public.list_api_tokens()
returns table (
  id uuid,
  name text,
  prefix text,
  scope text,
  created_at timestamptz,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  calls_today integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.name,
    t.prefix,
    t.scope,
    t.created_at,
    t.last_used_at,
    t.expires_at,
    t.revoked_at,
    coalesce((
      select u.calls
      from public.api_usage u
      where u.token_id = t.id and u.day = current_date
    ), 0)::integer
  from public.api_tokens t
  where t.owner_id = (select auth.uid())
  order by t.created_at desc;
end;
$$;

create or replace function public.revoke_api_token(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.api_tokens
     set revoked_at = pg_catalog.now()
   where id = p_id
     and owner_id = (select auth.uid())
     and revoked_at is null;

  return found;
end;
$$;

create or replace function public.list_api_audit(p_limit integer default 50)
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
  if (select auth.uid()) is null then
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

create or replace function public.undo_api_update(p_audit_id bigint)
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
  if (select auth.uid()) is null then
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

-- Explicit grants (0014 convention): management is authenticated-only and
-- self-scoped; anon stays refused. api_authenticate remains internal.
revoke all on function public.can_manage_api_tokens() from public, anon;
grant execute on function public.can_manage_api_tokens() to authenticated;

revoke all on function public.create_api_token(text, text, timestamptz)
  from public, anon;
grant execute on function public.create_api_token(text, text, timestamptz)
  to authenticated;

revoke all on function public.list_api_tokens() from public, anon;
grant execute on function public.list_api_tokens() to authenticated;

revoke all on function public.revoke_api_token(uuid) from public, anon;
grant execute on function public.revoke_api_token(uuid) to authenticated;

revoke all on function public.list_api_audit(integer) from public, anon;
grant execute on function public.list_api_audit(integer) to authenticated;

revoke all on function public.undo_api_update(bigint) from public, anon;
grant execute on function public.undo_api_update(bigint) to authenticated;

-- Remove the single-owner machinery. No function above reads the flag.
drop trigger if exists profiles_assign_first_owner on public.profiles;
drop function if exists public.assign_first_owner();
drop index if exists public.profiles_one_owner_idx;
alter table public.profiles drop column if exists is_owner;

comment on table public.api_tokens is
  'Per-account external access tokens. Only a SHA-256 hash is stored; management goes through self-scoped, authenticated RPCs.';
