-- save_note RPC: version conflicts, role limits, trash, and derived text.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'editor@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Editor"}'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'reader@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Reader"}'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Stranger"}');

insert into public.notebooks (id, owner_id, name)
values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Work');

insert into public.notes (id, owner_id, notebook_id, title, body_html) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Original', '<p>Original body</p>'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   null, 'Archived', '<p>Old</p>'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   null, 'Trashed', '<p>Gone</p>'),
  ('cccccccc-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   null, 'Revoked', '<p>Soon hidden</p>'),
  ('cccccccc-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111',
   null, 'Reader note', '<p>Read only</p>');

update public.notes set archived = true where id = 'cccccccc-0000-4000-8000-000000000002';
update public.notes set deleted_at = now() where id = 'cccccccc-0000-4000-8000-000000000003';

insert into public.note_shares (note_id, shared_with, permission, created_by) values
  ('cccccccc-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'edit',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'edit',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000003', '22222222-2222-2222-2222-222222222222', 'edit',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000004', '22222222-2222-2222-2222-222222222222', 'edit',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000005', '33333333-3333-3333-3333-333333333333', 'read',
   '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- Owner save.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select results_eq(
  $q$ select version from public.save_note(
        'cccccccc-0000-4000-8000-000000000001', 1, 'Owner title', '<p>Fresh body</p>') $q$,
  $q$ values (2) $q$,
  'owner save increments the version');
select is((select last_edited_by from public.notes
           where id = 'cccccccc-0000-4000-8000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'owner save records the owner as last editor');
select is((select title from public.notes
           where id = 'cccccccc-0000-4000-8000-000000000001'),
  'Owner title', 'owner save updates the title');
select is((select body_text from public.notes
           where id = 'cccccccc-0000-4000-8000-000000000001'),
  'Fresh body', 'body_text is derived from the saved HTML');

update public.notes set pinned = true where id = 'cccccccc-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Editor save.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';

select results_eq(
  $q$ select version from public.save_note(
        'cccccccc-0000-4000-8000-000000000001', 2, 'Editor title', '<p>Editor body</p>') $q$,
  $q$ values (3) $q$,
  'editor save increments the version');
select is((select last_edited_by from public.notes
           where id = 'cccccccc-0000-4000-8000-000000000001'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'editor save records the editor as last editor');
select is((select pinned from public.notes
           where id = 'cccccccc-0000-4000-8000-000000000001'),
  true, 'editor save cannot change pinned state');
select is((select notebook_id from public.notes
           where id = 'cccccccc-0000-4000-8000-000000000001'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'editor save cannot move the note');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select throws_ok(
  $q$ select public.save_note(
        'cccccccc-0000-4000-8000-000000000001', 1, 'Stale', '<p>Stale</p>') $q$,
  '40001', null, 'a stale expected version is a conflict');
select is((select version from public.notes
           where id = 'cccccccc-0000-4000-8000-000000000001'),
  3, 'a conflicting save does not change the stored version');

-- ---------------------------------------------------------------------------
-- Reader, stranger, trash, missing note.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select throws_ok(
  $q$ select public.save_note(
        'cccccccc-0000-4000-8000-000000000001', 3, 'Reader', '<p>Nope</p>') $q$,
  '42501', null, 'reader cannot save a note');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';
select throws_ok(
  $q$ select public.save_note(
        'cccccccc-0000-4000-8000-000000000001', 3, 'Stranger', '<p>Nope</p>') $q$,
  '42501', null, 'stranger cannot save a note');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';
select throws_ok(
  $q$ select public.save_note(
        'cccccccc-0000-4000-8000-000000000003', 1, 'Owner', '<p>Nope</p>') $q$,
  '55000', null, 'owner cannot save a trashed note');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';
select throws_ok(
  $q$ select public.save_note(
        'cccccccc-0000-4000-8000-000000000003', 1, 'Editor', '<p>Nope</p>') $q$,
  '55000', null, 'editor cannot save a trashed note');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';
select throws_ok(
  $q$ select public.save_note(
        'ffffffff-0000-4000-8000-000000000001', 1, 'Missing', '<p>Nope</p>') $q$,
  'P0002', null, 'saving a missing note reports not found');

-- ---------------------------------------------------------------------------
-- Archived notes stay editable.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';
select results_eq(
  $q$ select version from public.save_note(
        'cccccccc-0000-4000-8000-000000000002', 1, 'Archived editor', '<p>New</p>') $q$,
  $q$ values (2) $q$,
  'editor can save an archived note');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';
select results_eq(
  $q$ select version from public.save_note(
        'cccccccc-0000-4000-8000-000000000002', 2, 'Archived owner', '<p>Newer</p>') $q$,
  $q$ values (3) $q$,
  'owner can save an archived note');

-- ---------------------------------------------------------------------------
-- Revocation and permission upgrade.
-- ---------------------------------------------------------------------------
delete from public.note_shares
 where note_id = 'cccccccc-0000-4000-8000-000000000004'
   and shared_with = '22222222-2222-2222-2222-222222222222';
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';
select throws_ok(
  $q$ select public.save_note(
        'cccccccc-0000-4000-8000-000000000004', 1, 'Editor', '<p>Nope</p>') $q$,
  '42501', null, 'a revoked editor cannot save');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select throws_ok(
  $q$ select public.save_note(
        'cccccccc-0000-4000-8000-000000000005', 1, 'Reader', '<p>Nope</p>') $q$,
  '42501', null, 'reader cannot save with read permission');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';
update public.note_shares set permission = 'edit'
 where note_id = 'cccccccc-0000-4000-8000-000000000005'
   and shared_with = '33333333-3333-3333-3333-333333333333';
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select results_eq(
  $q$ select version from public.save_note(
        'cccccccc-0000-4000-8000-000000000005', 1, 'Reader now edits', '<p>Yes</p>') $q$,
  $q$ values (2) $q$,
  'reader can save after being upgraded to edit');

-- ---------------------------------------------------------------------------
-- Empty title is allowed and anonymous calls are refused.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';
select is((select title from public.save_note(
             'cccccccc-0000-4000-8000-000000000005', 2, '', '<p>Untitled</p>')),
  '', 'save_note accepts an empty title');
select is((select body_html from public.notes
           where id = 'cccccccc-0000-4000-8000-000000000005'),
  '<p>Untitled</p>', 'save_note stores the supplied HTML');
reset role;

set local role anon;
set local "request.jwt.claims" = '{}';
select throws_ok(
  $q$ select public.save_note(
        'cccccccc-0000-4000-8000-000000000001', 3, 'Anon', '<p>Nope</p>') $q$,
  '42501', null, 'anonymous callers cannot execute save_note');
reset role;

select * from finish();
rollback;
