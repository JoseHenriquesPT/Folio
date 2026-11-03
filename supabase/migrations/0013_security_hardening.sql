-- Security hardening from the 2026-11-03 review:
--   * public_profiles ran with the owner's privileges (Security Definer View),
--     so any signed-in user could enumerate every identity in the project. It
--     now runs with the caller's RLS, and profiles rows resolve only through
--     share relationships. Column grants keep email unreadable for API roles.
--   * Trigger machinery is no longer executable through /rest/v1/rpc.
--   * The three unindexed foreign keys, and a length bound on display_name
--     with truncation in the sign-up trigger (so a huge OAuth name can never
--     break account creation).

drop policy profiles_select_own on public.profiles;

create policy profiles_select_identity on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    -- A note is shared with me; this row is that note's owner.
    select 1
    from public.note_shares s
    join public.notes n on n.id = s.note_id
    where s.shared_with = (select auth.uid())
      and n.owner_id = profiles.id
  )
  or exists (
    -- I own a note shared with this user.
    select 1
    from public.note_shares s
    where s.shared_with = profiles.id
      and public.owns_note(s.note_id)
  )
);

revoke select on public.profiles from authenticated;
grant select (id, display_name) on public.profiles to authenticated;

alter view public.public_profiles set (security_invoker = true);

-- EXECUTE is not checked at trigger fire time, and nothing calls these through
-- the API: trigger functions are machinery, not surface.
revoke all on function public.handle_auth_user() from public, anon, authenticated;
revoke all on function public.validate_note_share() from public, anon, authenticated;
revoke all on function public.validate_notebook_parent() from public, anon, authenticated;
revoke all on function public.validate_note_notebook() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.prepare_note() from public, anon;
revoke all on function public.html_to_text(text) from public, anon;

-- Foreign keys the advisor flagged as unindexed.
create index attachments_owner_idx on public.attachments (owner_id);
create index note_shares_created_by_idx on public.note_shares (created_by);
create index notes_last_edited_by_idx on public.notes (last_edited_by);

-- Display names are bounded; the sign-up trigger truncates instead of failing.
update public.profiles
   set display_name = pg_catalog.left(display_name, 120)
 where pg_catalog.char_length(display_name) > 120;

alter table public.profiles
  add constraint profiles_display_name_length
  check (char_length(display_name) <= 120);

create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
begin
  candidate_name := pg_catalog.left(coalesce(
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  ), 120);

  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    pg_catalog.lower(coalesce(
      nullif(new.email, ''),
      new.id::text || '@local.invalid'
    )),
    candidate_name
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end;

  return new;
end;
$$;
