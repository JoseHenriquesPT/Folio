-- Card badges need the owner's display name and the recipient's own
-- permission. Both columns resolve through RLS-aware sources.

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
  (
    select s.permission
    from public.note_shares s
    where s.note_id = n.id
      and s.shared_with = (select auth.uid())
  ) as my_share_permission
from public.notes n;

grant select on public.note_summaries to authenticated;
