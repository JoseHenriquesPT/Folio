-- The Joplin importer restores the original created/updated timestamps.
-- INSERT keeps whatever the client supplied (the column defaults still apply
-- when it supplies nothing); UPDATE always stamps now() so edits stay honest.
create or replace function public.prepare_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := coalesce(new.title, '');
  new.body_html := coalesce(new.body_html, '');
  new.body_text := public.html_to_text(new.body_html);

  if tg_op = 'INSERT' then
    new.last_edited_by := coalesce(new.last_edited_by, new.owner_id);
  else
    new.updated_at := pg_catalog.now();
  end if;

  return new;
end;
$$;
