-- Write external tools: content edits follow the account's edit permission,
-- structural changes are owner-only, updates are version checked, and every
-- successful call is audited. There are no sharing, trash or delete tools.
begin;
create extension if not exists pgtap with schema extensions;

select plan(71);

update public.profiles set is_owner = false;

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@write.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Write Owner"}'),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'partner@write.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Write Partner"}'),
  ('c3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@write.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Write Stranger"}');

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
   null, 'Partner Notebook', 0),
  ('d4444444-4444-4444-8444-444444444406', 'a1111111-1111-4111-8111-111111111111',
   null, 'Parent Notebook', 3);

insert into public.notes
  (id, owner_id, notebook_id, title, body_html, version)
values
  ('e5555555-5555-4555-8555-555555555501', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Owner Note',
   '<p>First body</p>', 1),
  ('e5555555-5555-4555-8555-555555555502', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444403', 'Shared Edit Note',
   '<p>Edit me</p>', 1),
  ('e5555555-5555-4555-8555-555555555503', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Read-only Note',
   '<p>Read only</p>', 1),
  ('e5555555-5555-4555-8555-555555555504', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Trashed Note',
   '<p>Gone</p>', 1),
  ('e5555555-5555-4555-8555-555555555505', 'b2222222-2222-4222-8222-222222222222',
   'd4444444-4444-4444-8444-444444444405', 'Partner Note',
   '<p>Partner body</p>', 1),
  ('e5555555-5555-4555-8555-555555555506', 'b2222222-2222-4222-8222-222222222222',
   'd4444444-4444-4444-8444-444444444405', 'Partner Shared Note',
   '<p>Shared to owner</p>', 1);

update public.notes set deleted_at = now()
 where id = 'e5555555-5555-4555-8555-555555555504';

insert into public.tags (id, owner_id, name) values
  ('f6666666-6666-4666-8666-666666666601', 'a1111111-1111-4111-8111-111111111111', 'travel'),
  ('f6666666-6666-4666-8666-666666666602', 'a1111111-1111-4111-8111-111111111111', 'garden'),
  ('f6666666-6666-4666-8666-666666666603', 'b2222222-2222-4222-8222-222222222222', 'partner');

insert into public.note_tags (note_id, tag_id) values
  ('e5555555-5555-4555-8555-555555555501', 'f6666666-6666-4666-8666-666666666601');

insert into public.note_shares (note_id, shared_with, permission, created_by) values
  ('e5555555-5555-4555-8555-555555555503',
   'b2222222-2222-4222-8222-222222222222', 'read',
   'a1111111-1111-4111-8111-111111111111'),
  ('e5555555-5555-4555-8555-555555555506',
   'a1111111-1111-4111-8111-111111111111', 'edit',
   'b2222222-2222-4222-8222-222222222222');

insert into public.notebook_shares
  (notebook_id, shared_with, permission, created_by)
values
  ('d4444444-4444-4444-8444-444444444403',
   'b2222222-2222-4222-8222-222222222222', 'edit',
   'a1111111-1111-4111-8111-111111111111');

-- The owner can create both scopes. The partner/stranger write tokens are
-- direct inserts because token creation is owner-only in the product.
set local "request.jwt.claims" =
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
create temp table owner_read_token as
select * from public.create_api_token('Owner read', 'read',
  now() + interval '30 days');
create temp table owner_write_token as
select * from public.create_api_token('Owner write', 'write',
  now() + interval '30 days');

insert into public.api_tokens
  (owner_id, name, token_hash, prefix, scope, expires_at)
values
  ('b2222222-2222-4222-8222-222222222222', 'Partner write',
   encode(extensions.digest('folio_pat_partner_write', 'sha256'), 'hex'),
   left('folio_pat_partner_write', 16), 'write', now() + interval '30 days'),
  ('c3333333-3333-4333-8333-333333333333', 'Stranger write',
   encode(extensions.digest('folio_pat_stranger_write', 'sha256'), 'hex'),
   left('folio_pat_stranger_write', 16), 'write', now() + interval '30 days');

-- Read token cannot use any write tool.
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_read_token))::text, true);

select throws_ok(
  $q$ select public.api_create_note('Blocked', '<p>x</p>') $q$,
  '42501', null, 'a read token cannot create notes');
select throws_ok(
  $q$ select public.api_update_note('e5555555-5555-4555-8555-555555555501'::uuid,
       1, 'x', null) $q$,
  '42501', null, 'a read token cannot update notes');
select throws_ok(
  $q$ select public.api_move_notes(
       array['e5555555-5555-4555-8555-555555555501'::uuid], null) $q$,
  '42501', null, 'a read token cannot move notes');
select throws_ok(
  $q$ select public.api_create_notebook('Blocked') $q$,
  '42501', null, 'a read token cannot create notebooks');

-- Owner write token.
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_write_token))::text, true);

create temp table created_note as
select public.api_create_note(
  'Created Note', '<p>Created body</p>',
  'd4444444-4444-4444-8444-444444444401',
  array['Travel', 'new']
) as payload;

select is(
  (select payload ->> 'title' from created_note),
  'Created Note', 'the owner creates a note');
select is(
  (select (payload ->> 'version')::int from created_note),
  1, 'a new note starts at version 1');
select is(
  (select jsonb_array_length(payload -> 'tags') from created_note),
  2, 'the new note has both tags');
select is(
  (select payload -> 'tags' @> '["travel"]'::jsonb from created_note),
  true, 'the existing Travel tag is reused case-insensitively');
select is(
  (public.api_create_note(
     'Shared created', '<p>x</p>',
     'd4444444-4444-4444-8444-444444444403'
   ) ->> 'notebook_id'),
  'd4444444-4444-4444-8444-444444444403',
  'the owner may create in an owned notebook that is shared out');
select throws_ok(
  $q$ select public.api_create_note(
       'Wrong notebook', '<p>x</p>',
       'd4444444-4444-4444-8444-444444444405') $q$,
  '42501', null, 'the owner cannot create in a partner notebook');
select throws_ok(
  $q$ select public.api_create_note('', '') $q$,
  '22023', null, 'an empty note is rejected');

select is(
  (public.api_update_note(
     'e5555555-5555-4555-8555-555555555501'::uuid,
     1, 'Owner Note v2', '<p>Second body</p>'
   ) ->> 'version')::int,
  2, 'the owner updates the note at the expected version');
select is(
  (select title from public.notes
    where id = 'e5555555-5555-4555-8555-555555555501'),
  'Owner Note v2', 'the new title is stored');
select is(
  (select body_html from public.notes
    where id = 'e5555555-5555-4555-8555-555555555501'),
  '<p>Second body</p>', 'the new body is stored');
select is(
  (select (before_snapshot ->> 'version')::int from public.api_audit
    where tool = 'update_note'
      and note_ids @> array['e5555555-5555-4555-8555-555555555501'::uuid]
    order by id desc limit 1),
  1, 'the audit keeps the previous version');
select is(
  (select summary ? 'body_html' from public.api_audit
    where tool = 'update_note'
      and note_ids @> array['e5555555-5555-4555-8555-555555555501'::uuid]
    order by id desc limit 1),
  false, 'the audit summary does not carry the body');
select throws_ok(
  $q$ select public.api_update_note(
       'e5555555-5555-4555-8555-555555555501'::uuid,
       1, 'Stale', null) $q$,
  '40001', null, 'a stale version is rejected');
select is(
  (public.api_update_note(
     'e5555555-5555-4555-8555-555555555501'::uuid,
     2, 'Owner Note v3', null
   ) ->> 'version')::int,
  3, 'a title-only update increments the version');
select is(
  (select body_html from public.notes
    where id = 'e5555555-5555-4555-8555-555555555501'),
  '<p>Second body</p>', 'a title-only update keeps the body');
select throws_ok(
  $q$ select public.api_update_note(
       'e5555555-5555-4555-8555-555555555504'::uuid,
       1, 'Trashed', null) $q$,
  '55000', null, 'a trashed note cannot be updated');

-- Partner content permissions: notebook edit is allowed, read-only is not.
select set_config('request.headers',
  '{"x-folio-token":"folio_pat_partner_write"}', true);

select is(
  (public.api_update_note(
     'e5555555-5555-4555-8555-555555555502'::uuid,
     1, 'Partner Edited', '<p>Partner edit</p>'
   ) ->> 'version')::int,
  2, 'an editor share can update content');
select throws_ok(
  $q$ select public.api_update_note(
       'e5555555-5555-4555-8555-555555555503'::uuid,
       1, 'Blocked', null) $q$,
  '42501', null, 'a read share cannot update content');
select throws_ok(
  $q$ select public.api_update_note(
       'e5555555-5555-4555-8555-555555555501'::uuid,
       3, 'Blocked', null) $q$,
  '42501', null, 'an unshared owner note cannot be updated');

-- The owner can edit a partner note shared back with edit.
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_write_token))::text, true);

select is(
  (public.api_update_note(
     'e5555555-5555-4555-8555-555555555506'::uuid,
     1, 'Owner edit of shared', '<p>Owner edit</p>'
   ) ->> 'version')::int,
  2, 'the owner can edit a note shared with them');

-- Structural moves are owner-only.
select is(
  (public.api_move_notes(
     array['e5555555-5555-4555-8555-555555555501'::uuid,
           'e5555555-5555-4555-8555-555555555503'::uuid],
     'd4444444-4444-4444-8444-444444444402'
   ) ->> 'moved')::int,
  2, 'the owner moves two notes');
select is(
  (select notebook_id from public.notes
    where id = 'e5555555-5555-4555-8555-555555555501'),
  'd4444444-4444-4444-8444-444444444402'::uuid,
  'the first moved note lands in the target');
select is(
  (select notebook_id from public.notes
    where id = 'e5555555-5555-4555-8555-555555555503'),
  'd4444444-4444-4444-8444-444444444402'::uuid,
  'the second moved note lands in the target');
select throws_ok(
  $q$ select public.api_move_notes(
       array['e5555555-5555-4555-8555-555555555501'::uuid],
       'd4444444-4444-4444-8444-444444444405') $q$,
  '42501', null, 'a partner notebook is not a valid move target');

select set_config('request.headers',
  '{"x-folio-token":"folio_pat_partner_write"}', true);
select throws_ok(
  $q$ select public.api_move_notes(
       array['e5555555-5555-4555-8555-555555555502'::uuid], null) $q$,
  '42501', null, 'an editor cannot move the owner note');

-- Tags are owner-only.
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_write_token))::text, true);

select is(
  (public.api_add_tags(
     array['e5555555-5555-4555-8555-555555555501'::uuid,
           'e5555555-5555-4555-8555-555555555503'::uuid],
     array['Travel', 'fresh']
   ) -> 'tags' @> '["fresh"]'::jsonb),
  true, 'adding tags creates the new tag and reuses Travel');
select is(
  (select count(*) from public.note_tags nt
    join public.tags t on t.id = nt.tag_id
    where nt.note_id = 'e5555555-5555-4555-8555-555555555501'
      and t.name = 'fresh'),
  1::bigint, 'the new tag is linked to the note');
select is(
  (public.api_remove_tags(
     array['e5555555-5555-4555-8555-555555555501'::uuid],
     array['travel']
   ) ->> 'removed')::int,
  1, 'removing a tag deletes the link');
select is(
  (select count(*) from public.note_tags nt
    join public.tags t on t.id = nt.tag_id
    where nt.note_id = 'e5555555-5555-4555-8555-555555555501'
      and t.name = 'travel'),
  0::bigint, 'the tag link is gone');
select is(
  (select count(*) from public.tags
    where owner_id = 'a1111111-1111-4111-8111-111111111111'
      and lower(name) = 'travel'),
  1::bigint, 'the tag itself remains');

select set_config('request.headers',
  '{"x-folio-token":"folio_pat_partner_write"}', true);
select throws_ok(
  $q$ select public.api_add_tags(
       array['e5555555-5555-4555-8555-555555555502'::uuid],
       array['partner-tag']) $q$,
  '42501', null, 'an editor cannot tag the owner note');

-- Notebooks.
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_write_token))::text, true);

create temp table created_notebook as
select public.api_create_notebook(
  'Child', 'd4444444-4444-4444-8444-444444444406'
) as payload;
select is(
  (select (payload ->> 'position')::int from created_notebook),
  0, 'a first child starts at position 0');
select is(
  (select payload ->> 'parent_id' from created_notebook),
  'd4444444-4444-4444-8444-444444444406', 'the parent is stored');
select throws_ok(
  $q$ select public.api_create_notebook(
       'Wrong parent', 'd4444444-4444-4444-8444-444444444405') $q$,
  '42501', null, 'a partner notebook cannot be a parent');
select is(
  (public.api_rename_notebook(
     'd4444444-4444-4444-8444-444444444401'::uuid, 'Renamed'
   ) ->> 'name'),
  'Renamed', 'the owner renames a notebook');
select is(
  (select name from public.notebooks
    where id = 'd4444444-4444-4444-8444-444444444401'),
  'Renamed', 'the rename is stored');
select throws_ok(
  $q$ select public.api_rename_notebook(
       'd4444444-4444-4444-8444-444444444405'::uuid, 'Hacked') $q$,
  '42501', null, 'a partner notebook cannot be renamed');

select set_config('request.headers',
  '{"x-folio-token":"folio_pat_partner_write"}', true);
select is(
  (public.api_create_notebook(
     'Partner Child', 'd4444444-4444-4444-8444-444444444405'
   ) ->> 'name'),
  'Partner Child', 'a partner can create in their own notebook');
select is(
  (public.api_rename_notebook(
     'd4444444-4444-4444-8444-444444444405'::uuid, 'Partner Renamed'
   ) ->> 'name'),
  'Partner Renamed', 'a partner can rename their own notebook');
select is(
  (public.api_create_note(
     'Partner created', '<p>Partner body</p>',
     'd4444444-4444-4444-8444-444444444405'
   ) ->> 'title'),
  'Partner created', 'a partner can create in their own notebook');
select throws_ok(
  $q$ select public.api_create_note(
       'Shared create', '<p>x</p>',
       'd4444444-4444-4444-8444-444444444403') $q$,
  '42501', null, 'a partner cannot create in an edit-shared notebook');

-- Stranger: write token, no access.
select set_config('request.headers',
  '{"x-folio-token":"folio_pat_stranger_write"}', true);
select throws_ok(
  $q$ select public.api_update_note(
       'e5555555-5555-4555-8555-555555555501'::uuid,
       3, 'Blocked', null) $q$,
  '42501', null, 'a stranger cannot update');
select throws_ok(
  $q$ select public.api_move_notes(
       array['e5555555-5555-4555-8555-555555555501'::uuid], null) $q$,
  '42501', null, 'a stranger cannot move');
select throws_ok(
  $q$ select public.api_add_tags(
       array['e5555555-5555-4555-8555-555555555501'::uuid],
       array['x']) $q$,
  '42501', null, 'a stranger cannot tag');

-- Audit and grants.
select is(
  (select count(*) > 0 from public.api_audit),
  true, 'successful writes are audited');
select is(
  (select token_id = (select id from owner_write_token)
   from public.api_audit
   where tool = 'update_note'
     and note_ids @> array['e5555555-5555-4555-8555-555555555501'::uuid]
   order by id desc limit 1),
  true, 'the audit records the token');
select is(
  (select before_snapshot is not null from public.api_audit
   where tool = 'update_note'
     and note_ids @> array['e5555555-5555-4555-8555-555555555501'::uuid]
   order by id desc limit 1),
  true, 'the update audit has a before snapshot');

select is(
  (select has_function_privilege('anon',
     'public.api_create_note(text,text,uuid,text[])', 'execute')),
  true, 'anon can call api_create_note');
select is(
  (select has_function_privilege('authenticated',
     'public.api_create_note(text,text,uuid,text[])', 'execute')),
  false, 'authenticated cannot call api_create_note');
select is(
  (select has_function_privilege('anon',
     'public.api_update_note(uuid,integer,text,text)', 'execute')),
  true, 'anon can call api_update_note');
select is(
  (select has_function_privilege('authenticated',
     'public.api_update_note(uuid,integer,text,text)', 'execute')),
  false, 'authenticated cannot call api_update_note');
select is(
  (select has_function_privilege('anon',
     'public.api_move_notes(uuid[],uuid)', 'execute')),
  true, 'anon can call api_move_notes');
select is(
  (select has_function_privilege('authenticated',
     'public.api_move_notes(uuid[],uuid)', 'execute')),
  false, 'authenticated cannot call api_move_notes');
select is(
  (select has_function_privilege('anon',
     'public.api_add_tags(uuid[],text[])', 'execute')),
  true, 'anon can call api_add_tags');
select is(
  (select has_function_privilege('authenticated',
     'public.api_add_tags(uuid[],text[])', 'execute')),
  false, 'authenticated cannot call api_add_tags');
select is(
  (select has_function_privilege('anon',
     'public.api_remove_tags(uuid[],text[])', 'execute')),
  true, 'anon can call api_remove_tags');
select is(
  (select has_function_privilege('authenticated',
     'public.api_remove_tags(uuid[],text[])', 'execute')),
  false, 'authenticated cannot call api_remove_tags');
select is(
  (select has_function_privilege('anon',
     'public.api_create_notebook(text,uuid)', 'execute')),
  true, 'anon can call api_create_notebook');
select is(
  (select has_function_privilege('authenticated',
     'public.api_create_notebook(text,uuid)', 'execute')),
  false, 'authenticated cannot call api_create_notebook');
select is(
  (select has_function_privilege('anon',
     'public.api_rename_notebook(uuid,text)', 'execute')),
  true, 'anon can call api_rename_notebook');
select is(
  (select has_function_privilege('authenticated',
     'public.api_rename_notebook(uuid,text)', 'execute')),
  false, 'authenticated cannot call api_rename_notebook');

select is(
  (select has_function_privilege('anon',
     'public.api_record_audit(uuid,uuid,text,uuid[],jsonb,jsonb)', 'execute')),
  false, 'api_record_audit stays internal');
select is(
  (select has_function_privilege('authenticated',
     'public.api_record_audit(uuid,uuid,text,uuid[],jsonb,jsonb)', 'execute')),
  false, 'authenticated cannot call api_record_audit');
select is(
  (select has_function_privilege('anon',
     'public.api_upsert_tag(uuid,text)', 'execute')),
  false, 'api_upsert_tag stays internal');
select is(
  (select has_function_privilege('authenticated',
     'public.api_upsert_tag(uuid,text)', 'execute')),
  false, 'authenticated cannot call api_upsert_tag');
select is(
  (select has_function_privilege('anon',
     'public.api_require_owned_notes(uuid[])', 'execute')),
  false, 'api_require_owned_notes stays internal');
select is(
  (select has_function_privilege('authenticated',
     'public.api_require_owned_notes(uuid[])', 'execute')),
  false, 'authenticated cannot call api_require_owned_notes');

select * from finish();
rollback;
