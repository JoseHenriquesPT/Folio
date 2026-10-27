-- Realtime needs full row images for notes and share changes.

alter table public.notes replica identity full;
alter table public.note_shares replica identity full;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notes'
    ) then
      alter publication supabase_realtime add table public.notes;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'note_shares'
    ) then
      alter publication supabase_realtime add table public.note_shares;
    end if;
  end if;
end;
$$;
