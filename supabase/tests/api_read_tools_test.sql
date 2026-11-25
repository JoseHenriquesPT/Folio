-- Read-only external tools: account-wide visibility (owned plus shared),
-- archive/trash rules, notebook boundaries, tags and overview. Every tool
-- authenticates the token first; the account comes from the token, never from
-- an argument.
begin;
create extension if not exists pgtap with schema extensions;

select plan(67);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@read.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"API Owner"}'),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'partner@read.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"API Partner"}'),
  ('c3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@read.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"API Stranger"}');

insert into public.notebooks (id, owner_id, parent_id, name, position) values
  ('d4444444-4444-4444-8444-444444444401', 'a1111111-1111-4111-8111-111111111111',
   null, 'Owner Notebook', 0),
  ('d4444444-4444-4444-8444-444444444402', 'a1111111-1111-4111-8111-111111111111',
   null, 'Owner Archive', 1),
  ('d4444444-4444-4444-8444-444444444403', 'a1111111-1111-4111-8111-111111111111',
   null, 'Shared Root', 2),
  ('d4444444-4444-4444-8444-444444444404', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444403', 'Shared Child', 0),
  ('d4444444-4444-4444-8444-444444444405', 'b2222222-2222-4222-8222-222222222222',
   null, 'Partner Notebook', 0);

insert into public.notes
  (id, owner_id, notebook_id, title, body_html, archived, deleted_at)
values
  ('e5555555-5555-4555-8555-555555555501', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Lisbon Trip',
   '<p>Pack for Lisbon and the tram.</p>', false, null),
  ('e5555555-5555-4555-8555-555555555502', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444402', 'Old Lisbon',
   '<p>An archived trip.</p>', true, null),
  ('e5555555-5555-4555-8555-555555555503', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Garden',
   '<p>Tomatoes and basil.</p>', false, null),
  ('e5555555-5555-4555-8555-555555555504', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Trashed',
   '<p>Gone.</p>', false, now()),
  ('e5555555-5555-4555-8555-555555555505', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444403', 'Shared Note',
   '<p>Shared with partner.</p>', false, null),
  ('e5555555-5555-4555-8555-555555555506', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444404', 'Shared Child Note',
   '<p>Child of the shared notebook.</p>', false, null),
  ('e5555555-5555-4555-8555-555555555507', 'b2222222-2222-4222-8222-222222222222',
   'd4444444-4444-4444-8444-444444444405', 'Partner Secret',
   '<p>Only the partner.</p>', false, null),
  ('e5555555-5555-4555-8555-555555555508', 'b2222222-2222-4222-8222-222222222222',
   'd4444444-4444-4444-8444-444444444405', 'Partner Shared With Owner',
   '<p>Shared the other way.</p>', false, null);

insert into public.tags (id, owner_id, name) values
  ('f6666666-6666-4666-8666-666666666601', 'a1111111-1111-4111-8111-111111111111', 'travel'),
  ('f6666666-6666-4666-8666-666666666602', 'a1111111-1111-4111-8111-111111111111', 'garden'),
  ('f6666666-6666-4666-8666-666666666603', 'b2222222-2222-4222-8222-222222222222', 'partner');

insert into public.note_tags (note_id, tag_id) values
  ('e5555555-5555-4555-8555-555555555501', 'f6666666-6666-4666-8666-666666666601'),
  ('e5555555-5555-4555-8555-555555555503', 'f6666666-6666-4666-8666-666666666602'),
  ('e5555555-5555-4555-8555-555555555507', 'f6666666-6666-4666-8666-666666666603');

insert into public.attachments
  (id, note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
values
  ('a7777777-7777-4777-8777-777777777701',
   'e5555555-5555-4555-8555-555555555501',
   'a1111111-1111-4111-8111-111111111111',
   'e5555555-5555-4555-8555-555555555501/tram.jpg',
   'tram.jpg', 'image/jpeg', 2048);

insert into public.note_shares (note_id, shared_with, permission, created_by) values
  ('e5555555-5555-4555-8555-555555555508',
   'a1111111-1111-4111-8111-111111111111', 'read',
   'b2222222-2222-4222-8222-222222222222');

insert into public.notebook_shares
  (notebook_id, shared_with, permission, created_by)
values
  ('d4444444-4444-4444-8444-444444444403',
   'b2222222-2222-4222-8222-222222222222', 'read',
   'a1111111-1111-4111-8111-111111111111');

-- Owner token through the real creator; the partner/stranger tokens are direct
-- inserts because token creation is owner-only in the product.
set local "request.jwt.claims" =
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
create temp table owner_token as
select * from public.create_api_token('Owner read', 'read',
  now() + interval '30 days');

insert into public.api_tokens
  (owner_id, name, token_hash, prefix, scope, expires_at)
values
  ('b2222222-2222-4222-8222-222222222222', 'Partner read',
   encode(extensions.digest('folio_pat_partner_read', 'sha256'), 'hex'),
   left('folio_pat_partner_read', 16), 'read', now() + interval '30 days'),
  ('c3333333-3333-4333-8333-333333333333', 'Stranger read',
   encode(extensions.digest('folio_pat_stranger_read', 'sha256'), 'hex'),
   left('folio_pat_stranger_read', 16), 'read', now() + interval '30 days');

-- Owner view.
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_token))::text, true);

select is(
  (select jsonb_array_length(public.api_search_notes('Lisbon') -> 'notes')),
  1, 'the owner searches their own active note');
select is(
  (public.api_search_notes('Lisbon') #>> '{notes,0,title}'),
  'Lisbon Trip', 'search returns the note title');
select is(
  (select jsonb_array_length(public.api_search_notes('tr') -> 'notes')),
  1, 'the short-term fallback finds a partial body match');
select is(
  (select jsonb_array_length(
     public.api_search_notes('Lisbon', null::uuid, null::text, true) -> 'notes'
   )),
  2, 'include_archived adds the archived note');
select is(
  (select jsonb_array_length(public.api_search_notes('Shared') -> 'notes')),
  3, 'the owner sees owned and shared-with-owner notes');
select is(
  (select jsonb_array_length(public.api_search_notes('Partner Secret') -> 'notes')),
  0, 'the owner cannot search a partner unshared note');

select is(
  (public.api_get_note('e5555555-5555-4555-8555-555555555501') ->> 'title'),
  'Lisbon Trip', 'get_note returns the title');
select is(
  (public.api_get_note('e5555555-5555-4555-8555-555555555501') ->> 'body_html')
    like '%Pack for Lisbon%',
  true, 'get_note returns the stored HTML');
select is(
  (select jsonb_array_length(
     public.api_get_note('e5555555-5555-4555-8555-555555555501') -> 'tags'
   )),
  1, 'get_note returns the note tags');
select is(
  (public.api_get_note('e5555555-5555-4555-8555-555555555501') #>> '{tags,0}'),
  'travel', 'the tag name is returned');
select is(
  (select jsonb_array_length(
     public.api_get_note('e5555555-5555-4555-8555-555555555501') -> 'attachments'
   )),
  1, 'get_note returns attachment metadata');
select is(
  (public.api_get_note('e5555555-5555-4555-8555-555555555501')
     #>> '{attachments,0,file_name}'),
  'tram.jpg', 'the attachment file name is returned');
select is(
  (public.api_get_note('e5555555-5555-4555-8555-555555555508') ->> 'title'),
  'Partner Shared With Owner', 'the owner can read a note shared with them');
select is(
  (public.api_get_note('e5555555-5555-4555-8555-555555555508')
     ->> 'notebook_name'),
  null::text, 'a note in an unreadable notebook hides the notebook name');
select throws_ok(
  $q$ select public.api_get_note('e5555555-5555-4555-8555-555555555507') $q$,
  'P0002', null, 'the owner cannot read a partner unshared note');
select throws_ok(
  $q$ select public.api_get_note('e5555555-5555-4555-8555-555555555504') $q$,
  'P0002', null, 'a trashed note is not readable through the API');

select is(
  (select jsonb_array_length(public.api_list_notes() -> 'notes')),
  5, 'list_notes excludes archived and trashed notes');
select is(
  (select jsonb_array_length(
     public.api_list_notes(null::uuid, null::text, true) -> 'notes'
   )),
  6, 'list_notes can include archived notes');
select is(
  (select jsonb_array_length(
     public.api_list_notes('d4444444-4444-4444-8444-444444444401') -> 'notes'
   )),
  2, 'list_notes filters by notebook');
select is(
  (select jsonb_array_length(
     public.api_list_notes(null::uuid, 'travel') -> 'notes'
   )),
  1, 'list_notes filters by tag');
select is(
  (select jsonb_array_length(
     public.api_list_notes(null::uuid, null::text, false, 2, 0) -> 'notes'
   )),
  2, 'list_notes honours the page size');
select is(
  (public.api_list_notes(null::uuid, null::text, false, 2, 0) ->> 'has_more')::boolean,
  true, 'list_notes reports more pages');

select is(
  (select jsonb_array_length(public.api_list_notebooks() -> 'notebooks')),
  4, 'the owner sees their own notebooks only');
select is(
  (select (n ->> 'note_count')::int
   from jsonb_array_elements(public.api_list_notebooks() -> 'notebooks') n
   where n ->> 'id' = 'd4444444-4444-4444-8444-444444444401'),
  2, 'notebook note counts exclude trashed notes');
select is(
  (select (n ->> 'note_count')::int
   from jsonb_array_elements(public.api_list_notebooks() -> 'notebooks') n
   where n ->> 'id' = 'd4444444-4444-4444-8444-444444444403'),
  1, 'the shared root counts its own note');
select is(
  (select n ->> 'parent_id'
   from jsonb_array_elements(public.api_list_notebooks() -> 'notebooks') n
   where n ->> 'id' = 'd4444444-4444-4444-8444-444444444403'),
  null::text, 'a root notebook has no parent');

select is(
  (select jsonb_array_length(public.api_list_tags() -> 'tags')),
  2, 'the owner sees only their tags');
select is(
  (select (t ->> 'note_count')::int
   from jsonb_array_elements(public.api_list_tags() -> 'tags') t
   where t ->> 'name' = 'travel'),
  1, 'tag counts exclude trashed notes');

select is(
  (public.api_get_vault_overview() #>> '{notes,owned_active}')::int,
  4, 'the overview counts active owned notes');
select is(
  (public.api_get_vault_overview() #>> '{notes,owned_archived}')::int,
  1, 'the overview counts archived notes');
select is(
  (public.api_get_vault_overview() #>> '{notes,owned_trashed}')::int,
  1, 'the overview counts trashed notes');
select is(
  (public.api_get_vault_overview() #>> '{notes,shared_active}')::int,
  1, 'the overview counts shared-with-owner notes');
select is(
  (public.api_get_vault_overview() #>> '{notebooks,owned}')::int,
  4, 'the overview counts owned notebooks');
select is(
  (public.api_get_vault_overview() #>> '{attachments,count}')::int,
  1, 'the overview counts owned attachments');
select is(
  (public.api_get_vault_overview() #>> '{attachments,bytes}')::int,
  2048, 'the overview sums attachment bytes');

-- Partner view: own notes plus the notebook subtree shared by the owner.
select set_config('request.headers',
  '{"x-folio-token":"folio_pat_partner_read"}', true);

select is(
  (select jsonb_array_length(public.api_search_notes('Lisbon') -> 'notes')),
  0, 'the partner cannot search the owner unshared note');
select is(
  (select jsonb_array_length(public.api_search_notes('Shared') -> 'notes')),
  3, 'the partner sees their own and the shared-subtree notes');
select is(
  (select jsonb_array_length(public.api_search_notes('Partner Secret') -> 'notes')),
  1, 'the partner sees their own unshared note');
select is(
  (public.api_get_note('e5555555-5555-4555-8555-555555555505') ->> 'title'),
  'Shared Note', 'the partner reads a note in the shared notebook');
select is(
  (public.api_get_note('e5555555-5555-4555-8555-555555555505')
     ->> 'notebook_name'),
  'Shared Root', 'the partner sees the readable notebook name');
select throws_ok(
  $q$ select public.api_get_note('e5555555-5555-4555-8555-555555555501') $q$,
  'P0002', null, 'the partner cannot read an owner unshared note');
select is(
  (select jsonb_array_length(public.api_list_notes() -> 'notes')),
  4, 'the partner sees four active readable notes');
select is(
  (select jsonb_array_length(public.api_list_notebooks() -> 'notebooks')),
  3, 'the partner sees the shared subtree and their own notebook');
select is(
  (select (n ->> 'shared')::boolean
   from jsonb_array_elements(public.api_list_notebooks() -> 'notebooks') n
   where n ->> 'id' = 'd4444444-4444-4444-8444-444444444403'),
  true, 'a shared notebook is flagged');
select is(
  (select n ->> 'owner_display_name'
   from jsonb_array_elements(public.api_list_notebooks() -> 'notebooks') n
   where n ->> 'id' = 'd4444444-4444-4444-8444-444444444403'),
  'API Owner', 'a shared notebook names its owner');
select is(
  (select n ->> 'parent_id'
   from jsonb_array_elements(public.api_list_notebooks() -> 'notebooks') n
   where n ->> 'id' = 'd4444444-4444-4444-8444-444444444404'),
  'd4444444-4444-4444-8444-444444444403',
  'a child inside the shared subtree keeps its parent');
select is(
  (select jsonb_array_length(public.api_list_tags() -> 'tags')),
  1, 'the partner sees only their own tags');
select is(
  (select t ->> 'name'
   from jsonb_array_elements(public.api_list_tags() -> 'tags') t),
  'partner', 'the partner tag is returned');
select is(
  (public.api_get_vault_overview() #>> '{notes,owned_active}')::int,
  2, 'the partner overview counts their own notes');
select is(
  (public.api_get_vault_overview() #>> '{notes,shared_active}')::int,
  2, 'the partner overview counts shared notes');
select is(
  (public.api_get_vault_overview() #>> '{notebooks,shared}')::int,
  2, 'the partner overview counts shared notebooks');

-- Stranger: no token relationship at all.
select set_config('request.headers',
  '{"x-folio-token":"folio_pat_stranger_read"}', true);
select is(
  (select jsonb_array_length(public.api_search_notes('Shared') -> 'notes')),
  0, 'a stranger sees nothing');

-- Missing and invalid tokens fail before any read.
select set_config('request.headers', '{}', true);
select throws_ok(
  $q$ select public.api_search_notes('Lisbon') $q$,
  '42501', null, 'a missing token is rejected');
select set_config('request.headers',
  '{"x-folio-token":"folio_pat_invalid"}', true);
select throws_ok(
  $q$ select public.api_search_notes('Lisbon') $q$,
  '42501', null, 'an invalid token is rejected');

-- Grants: the read surface is anon-only; authenticated users use the app.
select is(
  (select has_function_privilege('anon',
     'public.api_search_notes(text,uuid,text,boolean,integer)', 'execute')),
  true, 'anon can call api_search_notes');
select is(
  (select has_function_privilege('authenticated',
     'public.api_search_notes(text,uuid,text,boolean,integer)', 'execute')),
  false, 'authenticated cannot call api_search_notes');
select is(
  (select has_function_privilege('anon',
     'public.api_get_note(uuid)', 'execute')),
  true, 'anon can call api_get_note');
select is(
  (select has_function_privilege('authenticated',
     'public.api_get_note(uuid)', 'execute')),
  false, 'authenticated cannot call api_get_note');
select is(
  (select has_function_privilege('anon',
     'public.api_list_notes(uuid,text,boolean,integer,integer)', 'execute')),
  true, 'anon can call api_list_notes');
select is(
  (select has_function_privilege('authenticated',
     'public.api_list_notes(uuid,text,boolean,integer,integer)', 'execute')),
  false, 'authenticated cannot call api_list_notes');
select is(
  (select has_function_privilege('anon',
     'public.api_list_notebooks()', 'execute')),
  true, 'anon can call api_list_notebooks');
select is(
  (select has_function_privilege('authenticated',
     'public.api_list_notebooks()', 'execute')),
  false, 'authenticated cannot call api_list_notebooks');
select is(
  (select has_function_privilege('anon',
     'public.api_list_tags()', 'execute')),
  true, 'anon can call api_list_tags');
select is(
  (select has_function_privilege('authenticated',
     'public.api_list_tags()', 'execute')),
  false, 'authenticated cannot call api_list_tags');
select is(
  (select has_function_privilege('anon',
     'public.api_get_vault_overview()', 'execute')),
  true, 'anon can call api_get_vault_overview');
select is(
  (select has_function_privilege('authenticated',
     'public.api_get_vault_overview()', 'execute')),
  false, 'authenticated cannot call api_get_vault_overview');

select is(
  (select calls > 0 from public.api_usage
   where token_id = (select id from owner_token) and day = current_date),
  true, 'the owner token recorded usage');

select * from finish();
rollback;
