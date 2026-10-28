-- Project-wide attachment usage for the settings screen.
-- The storage budget is shared by the whole project, so this aggregate counts
-- every attachment rather than only the caller's rows. It exposes no note
-- content, file names, or per-note detail.

create or replace function public.attachment_usage()
returns table (total_bytes bigint, attachment_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(pg_catalog.sum(size_bytes), 0)::bigint,
    pg_catalog.count(*)::bigint
  from public.attachments;
$$;

revoke all on function public.attachment_usage() from public, anon;
grant execute on function public.attachment_usage() to authenticated;
