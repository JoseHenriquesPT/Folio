-- Audit viewer and undo: owner-only, metadata plus note titles (never the
-- before body), undo only while the note still matches the audited version,
-- and the undo is audited itself.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

update public.profiles set is_owner = false;

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@audit.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Audit Owner"}'),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'partner@audit.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Audit Partner"}'),
  ('c3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@audit.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Audit Stranger"}');

insert into public.notebooks (id, owner_id, name) values
  ('d4444444-4444-4444-8444-444444444401',
   'a1111111-1111-4111-8111-111111111111', 'Audit Notebook');

insert into public.notes (id, owner_id, notebook_id, title, body_html, version) values
  ('e5555555-5555-4555-8555-555555555501', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Audit A', '<p>A</p>', 1),
  ('e5555555-5555-4555-8555-555555555502', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Audit B', '<p>B</p>', 1),
  ('e5555555-5555-4555-8555-555555555503', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Audit C', '<p>C</p>', 1),
  ('e5555555-5555-4555-8555-555555555504', 'a1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444401', 'Audit D', '<p>D</p>', 1);

set local "request.jwt.claims" =
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
create temp table owner_write_token as
select * from public.create_api_token('Owner write', 'write',
  now() + interval '30 days');

select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_write_token))::text, true);

select public.api_update_note(
  'e5555555-5555-4555-8555-555555555501'::uuid,
  1, 'Audit A updated', '<p>A2</p>'
);

create temp table update_audit as
select id from public.api_audit
where tool = 'update_note'
  and note_ids @> array['e5555555-5555-4555-8555-555555555501'::uuid]
order by id desc
limit 1;

-- Claims drive auth.uid(); the grant checks are separate below.
set local "request.jwt.claims" =
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select count(*) >= 1 from public.list_api_audit()),
  true, 'the owner sees the audit log');
select is(
  (select tool from public.list_api_audit()
    where id = (select id from update_audit)),
  'update_note', 'the update audit is listed');
select is(
  (select can_undo from public.list_api_audit()
    where id = (select id from update_audit)),
  true, 'a matching update can be undone');
select is(
  (select note_titles from public.list_api_audit()
    where id = (select id from update_audit))
    @> array['Audit A updated'],
  true, 'the list includes the note title');
select is(
  (select token_name from public.list_api_audit()
    where id = (select id from update_audit)),
  'Owner write', 'the list names the token');
select is(
  (select summary ? 'body_html' from public.list_api_audit()
    where id = (select id from update_audit)),
  false, 'the list never returns the body');

select is(
  (public.undo_api_update((select id from update_audit)) ->> 'version')::int,
  3, 'undo writes a new version');
select is(
  (select title from public.notes
    where id = 'e5555555-5555-4555-8555-555555555501'),
  'Audit A', 'undo restores the title');
select is(
  (select body_html from public.notes
    where id = 'e5555555-5555-4555-8555-555555555501'),
  '<p>A</p>', 'undo restores the body');
select is(
  (select count(*) from public.api_audit where tool = 'undo_update'),
  1::bigint, 'the undo is audited');
select is(
  (select can_undo from public.list_api_audit()
    where id = (select id from update_audit)),
  false, 'the undone update is no longer undoable');
select throws_ok(
  $q$ select public.undo_api_update((select id from update_audit)) $q$,
  '40001', null, 'a second undo is a version conflict');
select is(
  (select tool from public.list_api_audit()
    order by id desc limit 1),
  'undo_update', 'the undo row is visible');

-- Non-owners cannot see or undo.
set local "request.jwt.claims" =
  '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $q$ select * from public.list_api_audit() $q$,
  '42501', null, 'the partner cannot read the audit log');
select throws_ok(
  $q$ select public.undo_api_update((select id from update_audit)) $q$,
  '42501', null, 'the partner cannot undo');
set local "request.jwt.claims" =
  '{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $q$ select * from public.list_api_audit() $q$,
  '42501', null, 'a stranger cannot read the audit log');
select throws_ok(
  $q$ select public.undo_api_update((select id from update_audit)) $q$,
  '42501', null, 'a stranger cannot undo');

-- Trashed and changed notes are refused.
reset role;
set local "request.jwt.claims" =
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_write_token))::text, true);
select public.api_update_note(
  'e5555555-5555-4555-8555-555555555502'::uuid,
  1, 'Audit B updated', '<p>B2</p>'
);
create temp table trash_audit as
select id from public.api_audit
where tool = 'update_note'
  and note_ids @> array['e5555555-5555-4555-8555-555555555502'::uuid]
order by id desc limit 1;
update public.notes set deleted_at = now()
 where id = 'e5555555-5555-4555-8555-555555555502';
-- Claims drive auth.uid(); the grant checks are separate below.
select throws_ok(
  $q$ select public.undo_api_update((select id from trash_audit)) $q$,
  '55000', null, 'a trashed note cannot be undone');

reset role;
set local "request.jwt.claims" =
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_write_token))::text, true);
select public.api_update_note(
  'e5555555-5555-4555-8555-555555555503'::uuid,
  1, 'Audit C updated', '<p>C2</p>'
);
create temp table changed_audit as
select id from public.api_audit
where tool = 'update_note'
  and note_ids @> array['e5555555-5555-4555-8555-555555555503'::uuid]
order by id desc limit 1;
select public.save_note(
  'e5555555-5555-4555-8555-555555555503'::uuid,
  2, 'Audit C changed', '<p>C3</p>'
);
-- Claims drive auth.uid(); the grant checks are separate below.
select is(
  (select can_undo from public.list_api_audit()
    where id = (select id from changed_audit)),
  false, 'a note changed after the update is not undoable');
select throws_ok(
  $q$ select public.undo_api_update((select id from changed_audit)) $q$,
  '40001', null, 'a changed note refuses the undo');

-- A structural audit has no content snapshot to undo.
reset role;
set local "request.jwt.claims" =
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_write_token))::text, true);
select public.api_move_notes(
  array['e5555555-5555-4555-8555-555555555504'::uuid], null
);
create temp table move_audit as
select id from public.api_audit
where tool = 'move_notes'
order by id desc limit 1;
-- Claims drive auth.uid(); the grant checks are separate below.
select throws_ok(
  $q$ select public.undo_api_update((select id from move_audit)) $q$,
  'P0002', null, 'a move audit is not undoable');

-- Grants: the audit surface is authenticated-only.
select is(
  (select has_function_privilege('authenticated',
     'public.list_api_audit(integer)', 'execute')),
  true, 'authenticated can list the audit');
select is(
  (select has_function_privilege('anon',
     'public.list_api_audit(integer)', 'execute')),
  false, 'anon cannot list the audit');
select is(
  (select has_function_privilege('authenticated',
     'public.undo_api_update(bigint)', 'execute')),
  true, 'authenticated can undo an update');
select is(
  (select has_function_privilege('anon',
     'public.undo_api_update(bigint)', 'execute')),
  false, 'anon cannot undo an update');

select * from finish();
rollback;
