-- Archive every active note in a notebook and its whole subtree, or bring them
-- back, as one owner action. The notebook itself is unchanged: this is the
-- bulk form of the existing per-note archive flag. Trashed notes, other
-- notebooks and other owners are never touched.
--
-- Grants are explicit per the 0014 convention: hosted has no default ACLs, so
-- PUBLIC and anon are revoked and only authenticated receives EXECUTE.

create function public.set_notebook_archived(
  p_notebook_id uuid,
  p_archived boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if p_archived is null then
    raise exception 'archive flag is required' using errcode = '22023';
  end if;

  if not public.owns_notebook(p_notebook_id) then
    raise exception 'notebook not found or not owned by this account'
      using errcode = '42501';
  end if;

  with recursive subtree as (
    select nb.id
    from public.notebooks nb
    where nb.id = p_notebook_id
    union all
    select child.id
    from public.notebooks child
    join subtree parent on child.parent_id = parent.id
  )
  update public.notes n
  set archived = p_archived
  where n.notebook_id in (select id from subtree)
    and n.owner_id = (select auth.uid())
    and n.deleted_at is null
    and n.archived <> p_archived;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.set_notebook_archived(uuid, boolean)
  from public, anon;
grant execute on function public.set_notebook_archived(uuid, boolean)
  to authenticated;
