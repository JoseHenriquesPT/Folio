-- List-facing views: one paginated query returns note cards with tags,
-- attachment counts, and share counts. Underlying RLS still applies because
-- both views run with the caller's privileges.

create view public.note_summaries
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
  ) as share_recipients
from public.notes n;

create view public.tag_summaries
with (security_invoker = true)
as
select
  t.id,
  t.owner_id,
  t.name,
  t.color,
  count(nt.note_id)::integer as note_count
from public.tags t
left join public.note_tags nt on nt.tag_id = t.id
group by t.id, t.owner_id, t.name, t.color;

revoke all on public.note_summaries from anon, authenticated;
revoke all on public.tag_summaries from anon, authenticated;
grant select on public.note_summaries to authenticated;
grant select on public.tag_summaries to authenticated;
