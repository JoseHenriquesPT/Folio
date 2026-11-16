-- Read-only external tools (Phase 8.2).
--
-- Every function authenticates the x-folio-token header with api_authenticate,
-- sets the request claims to the token's account, and then filters explicitly
-- with the same ownership/share helpers as the app. The functions are
-- security-definer and executable by anon: the token is the credential, and
-- no function accepts an owner id. Grants are explicit per 0014.

create function public.api_search_notes(
  p_query text,
  p_notebook_id uuid default null,
  p_tag text default null,
  p_include_archived boolean default false,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_short text;
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  select a.owner_id into v_actor from public.api_authenticate('read') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  if v_query = '' then
    raise exception 'query is required' using errcode = '22023';
  end if;

  v_short := pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(v_query, '[%_\\,()]', '', 'g'),
      '\s+', ' ', 'g'
    )
  );

  if pg_catalog.char_length(v_query) < 3 and v_short = '' then
    return pg_catalog.jsonb_build_object(
      'query', v_query, 'count', 0, 'notes', '[]'::jsonb
    );
  end if;

  v_like := '%' || v_short || '%';

  return (
    with matched as (
      select
        n.id,
        n.title,
        n.body_text,
        n.notebook_id,
        n.pinned,
        n.archived,
        n.version,
        n.created_at,
        n.updated_at,
        case
          when pg_catalog.char_length(v_query) >= 3
            then pg_catalog.ts_rank(
              n.search,
              pg_catalog.websearch_to_tsquery('simple', v_query)
            )
          else 0
        end as rank
      from public.notes n
      where n.deleted_at is null
        and public.can_read_note(n.id)
        and (p_include_archived or not n.archived)
        and (p_notebook_id is null or n.notebook_id = p_notebook_id)
        and (
          p_tag is null
          or exists (
            select 1
            from public.note_tags nt
            join public.tags t on t.id = nt.tag_id
            where nt.note_id = n.id
              and pg_catalog.lower(t.name) =
                  pg_catalog.lower(pg_catalog.btrim(p_tag))
          )
        )
        and (
          case
            when pg_catalog.char_length(v_query) >= 3
              then n.search @@ pg_catalog.websearch_to_tsquery('simple', v_query)
            else
              n.title ilike v_like
              or n.body_text ilike v_like
          end
        )
      order by rank desc, n.updated_at desc
      limit v_limit
    )
    select pg_catalog.jsonb_build_object(
      'query', v_query,
      'count', (select pg_catalog.count(*) from matched),
      'notes', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', m.id,
              'title', m.title,
              'snippet', pg_catalog.left(
                pg_catalog.regexp_replace(
                  coalesce(m.body_text, ''), '\s+', ' ', 'g'
                ),
                200
              ),
              'notebook_id', m.notebook_id,
              'notebook_name', case
                when m.notebook_id is null then null
                when public.can_read_notebook(m.notebook_id) then (
                  select nb.name
                  from public.notebooks nb
                  where nb.id = m.notebook_id
                )
                else null
              end,
              'tags', coalesce(
                (
                  select pg_catalog.jsonb_agg(t.name order by t.name)
                  from public.note_tags nt
                  join public.tags t on t.id = nt.tag_id
                  where nt.note_id = m.id
                ),
                '[]'::jsonb
              ),
              'pinned', m.pinned,
              'archived', m.archived,
              'version', m.version,
              'created_at', m.created_at,
              'updated_at', m.updated_at
            )
            order by m.rank desc, m.updated_at desc
          )
          from matched m
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

create function public.api_get_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  select a.owner_id into v_actor from public.api_authenticate('read') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  if not exists (
    select 1
    from public.notes n
    where n.id = p_note_id
      and n.deleted_at is null
      and public.can_read_note(n.id)
  ) then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  return (
    select pg_catalog.jsonb_build_object(
      'id', n.id,
      'title', n.title,
      'body_html', n.body_html,
      'version', n.version,
      'notebook_id', n.notebook_id,
      'notebook_name', case
        when n.notebook_id is null then null
        when public.can_read_notebook(n.notebook_id) then (
          select nb.name
          from public.notebooks nb
          where nb.id = n.notebook_id
        )
        else null
      end,
      'tags', coalesce(
        (
          select pg_catalog.jsonb_agg(t.name order by t.name)
          from public.note_tags nt
          join public.tags t on t.id = nt.tag_id
          where nt.note_id = n.id
        ),
        '[]'::jsonb
      ),
      'pinned', n.pinned,
      'archived', n.archived,
      'created_at', n.created_at,
      'updated_at', n.updated_at,
      'attachments', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', a.id,
              'file_name', a.file_name,
              'mime_type', a.mime_type,
              'size_bytes', a.size_bytes
            )
            order by a.created_at
          )
          from public.attachments a
          where a.note_id = n.id
        ),
        '[]'::jsonb
      )
    )
    from public.notes n
    where n.id = p_note_id
  );
end;
$$;

create function public.api_list_notes(
  p_notebook_id uuid default null,
  p_tag text default null,
  p_include_archived boolean default false,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  select a.owner_id into v_actor from public.api_authenticate('read') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  return (
    with visible as (
      select
        n.id,
        n.title,
        n.body_text,
        n.notebook_id,
        n.pinned,
        n.archived,
        n.version,
        n.created_at,
        n.updated_at
      from public.notes n
      where n.deleted_at is null
        and public.can_read_note(n.id)
        and (p_include_archived or not n.archived)
        and (p_notebook_id is null or n.notebook_id = p_notebook_id)
        and (
          p_tag is null
          or exists (
            select 1
            from public.note_tags nt
            join public.tags t on t.id = nt.tag_id
            where nt.note_id = n.id
              and pg_catalog.lower(t.name) =
                  pg_catalog.lower(pg_catalog.btrim(p_tag))
          )
        )
      order by n.updated_at desc, n.id
      offset v_offset
      limit v_limit + 1
    ),
    page as (
      select * from visible limit v_limit
    )
    select pg_catalog.jsonb_build_object(
      'count', (select pg_catalog.count(*) from page),
      'has_more', (select pg_catalog.count(*) from visible) > v_limit,
      'notes', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', p.id,
              'title', p.title,
              'snippet', pg_catalog.left(
                pg_catalog.regexp_replace(
                  coalesce(p.body_text, ''), '\s+', ' ', 'g'
                ),
                200
              ),
              'notebook_id', p.notebook_id,
              'notebook_name', case
                when p.notebook_id is null then null
                when public.can_read_notebook(p.notebook_id) then (
                  select nb.name
                  from public.notebooks nb
                  where nb.id = p.notebook_id
                )
                else null
              end,
              'tags', coalesce(
                (
                  select pg_catalog.jsonb_agg(t.name order by t.name)
                  from public.note_tags nt
                  join public.tags t on t.id = nt.tag_id
                  where nt.note_id = p.id
                ),
                '[]'::jsonb
              ),
              'pinned', p.pinned,
              'archived', p.archived,
              'version', p.version,
              'created_at', p.created_at,
              'updated_at', p.updated_at
            )
            order by p.updated_at desc, p.id
          )
          from page p
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

create function public.api_list_notebooks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  select a.owner_id into v_actor from public.api_authenticate('read') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  return (
    select pg_catalog.jsonb_build_object(
      'notebooks', coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', nb.id,
            'name', nb.name,
            'parent_id', case
              when nb.parent_id is not null
                and public.can_read_notebook(nb.parent_id)
                then nb.parent_id
              else null
            end,
            'position', nb.position,
            'shared', nb.owner_id <> v_actor,
            'owner_display_name', case
              when nb.owner_id <> v_actor then (
                select p.display_name
                from public.profiles p
                where p.id = nb.owner_id
              )
              else null
            end,
            'note_count', (
              select pg_catalog.count(*)
              from public.notes n
              where n.notebook_id = nb.id
                and n.deleted_at is null
                and public.can_read_note(n.id)
            )
          )
          order by nb.position, nb.name, nb.id
        ),
        '[]'::jsonb
      )
    )
    from public.notebooks nb
    where public.can_read_notebook(nb.id)
  );
end;
$$;

create function public.api_list_tags()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  select a.owner_id into v_actor from public.api_authenticate('read') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  return (
    select pg_catalog.jsonb_build_object(
      'tags', coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'color', t.color,
            'note_count', (
              select pg_catalog.count(*)
              from public.note_tags nt
              join public.notes n on n.id = nt.note_id
              where nt.tag_id = t.id
                and n.deleted_at is null
            )
          )
          order by t.name
        ),
        '[]'::jsonb
      )
    )
    from public.tags t
    where t.owner_id = v_actor
  );
end;
$$;

create function public.api_get_vault_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  select a.owner_id into v_actor from public.api_authenticate('read') a;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_actor, 'role', 'authenticated'
    )::text,
    true
  );

  return pg_catalog.jsonb_build_object(
    'notes', pg_catalog.jsonb_build_object(
      'owned_active', (
        select pg_catalog.count(*)
        from public.notes n
        where n.owner_id = v_actor
          and n.deleted_at is null
          and not n.archived
      ),
      'owned_archived', (
        select pg_catalog.count(*)
        from public.notes n
        where n.owner_id = v_actor
          and n.deleted_at is null
          and n.archived
      ),
      'owned_trashed', (
        select pg_catalog.count(*)
        from public.notes n
        where n.owner_id = v_actor
          and n.deleted_at is not null
      ),
      'shared_active', (
        select pg_catalog.count(*)
        from public.notes n
        where n.owner_id <> v_actor
          and n.deleted_at is null
          and not n.archived
          and public.can_read_note(n.id)
      )
    ),
    'notebooks', pg_catalog.jsonb_build_object(
      'owned', (
        select pg_catalog.count(*)
        from public.notebooks nb
        where nb.owner_id = v_actor
      ),
      'shared', (
        select pg_catalog.count(*)
        from public.notebooks nb
        where nb.owner_id <> v_actor
          and public.can_read_notebook(nb.id)
      )
    ),
    'tags', (
      select pg_catalog.count(*)
      from public.tags t
      where t.owner_id = v_actor
    ),
    'attachments', pg_catalog.jsonb_build_object(
      'count', (
        select pg_catalog.count(*)
        from public.attachments a
        join public.notes n on n.id = a.note_id
        where n.owner_id = v_actor
      ),
      'bytes', (
        select coalesce(pg_catalog.sum(a.size_bytes), 0)
        from public.attachments a
        join public.notes n on n.id = a.note_id
        where n.owner_id = v_actor
      )
    )
  );
end;
$$;

-- Read tools are the external surface: anon carries the API key and
-- x-folio-token; the token is the credential. Authenticated users use the app
-- paths instead.
revoke all on function public.api_search_notes(
  text, uuid, text, boolean, integer
) from public, authenticated;
grant execute on function public.api_search_notes(
  text, uuid, text, boolean, integer
) to anon;

revoke all on function public.api_get_note(uuid) from public, authenticated;
grant execute on function public.api_get_note(uuid) to anon;

revoke all on function public.api_list_notes(
  uuid, text, boolean, integer, integer
) from public, authenticated;
grant execute on function public.api_list_notes(
  uuid, text, boolean, integer, integer
) to anon;

revoke all on function public.api_list_notebooks() from public, authenticated;
grant execute on function public.api_list_notebooks() to anon;

revoke all on function public.api_list_tags() from public, authenticated;
grant execute on function public.api_list_tags() to anon;

revoke all on function public.api_get_vault_overview()
  from public, authenticated;
grant execute on function public.api_get_vault_overview() to anon;
