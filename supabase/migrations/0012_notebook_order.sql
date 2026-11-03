-- Atomic notebook order: one call moves a dragged notebook into a parent and
-- rewrites every sibling position, so a reorder can never land half-applied.
-- The existing validate_notebook_parent trigger still rejects cycles and
-- cross-owner parents row by row.

create function public.reorder_notebooks(
  p_parent_id uuid,
  p_ordered_ids uuid[]
)
returns setof public.notebooks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_parent_id is not null and not exists (
    select 1 from public.notebooks n
    where n.id = p_parent_id and n.owner_id = v_uid
  ) then
    raise exception 'parent notebook not found' using errcode = 'P0002';
  end if;

  if p_ordered_ids is null or cardinality(p_ordered_ids) = 0 then
    return;
  end if;

  if cardinality(p_ordered_ids) <> (
    select count(distinct ids.id) from unnest(p_ordered_ids) as ids(id)
  ) then
    raise exception 'duplicate notebook ids' using errcode = '23505';
  end if;

  if p_parent_id = any(p_ordered_ids) then
    raise exception 'notebook parent cannot be itself' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_ids) as ids(id)
    left join public.notebooks n on n.id = ids.id
    where n.id is null or n.owner_id <> v_uid
  ) then
    raise exception 'notebook not found' using errcode = 'P0002';
  end if;

  -- A notebook already sitting under this parent may not be dropped from the
  -- list: it would keep a stale position beside the rewritten ones.
  if exists (
    select 1
    from public.notebooks n
    where n.owner_id = v_uid
      and n.parent_id is not distinct from p_parent_id
      and not (n.id = any(p_ordered_ids))
  ) then
    raise exception 'the order must include every notebook under this parent'
      using errcode = '23514';
  end if;

  update public.notebooks n
  set parent_id = p_parent_id,
      position = (ordered.ord - 1)::integer
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where n.id = ordered.id and n.owner_id = v_uid;

  return query
    select *
    from public.notebooks n
    where n.id = any(p_ordered_ids)
    order by n.position, n.name;
end;
$$;

revoke all on function public.reorder_notebooks(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_notebooks(uuid, uuid[]) to authenticated;
