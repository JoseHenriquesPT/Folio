-- Phase 2 access matrix: owner / editor / reader / stranger.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(64);

-- Fixtures are inserted as the database owner, bypassing RLS.
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

insert into public.notebooks (id, owner_id, parent_id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', null, 'Work'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'Projects'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '44444444-4444-4444-4444-444444444444', null, 'Elsewhere');

insert into public.tags (id, owner_id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Design'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'Ideas');

insert into public.notes (id, owner_id, notebook_id, title, body_html) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Shared note', '<p>Hello partner</p>'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   null, 'Trashed note', '<p>Gone</p>'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   null, 'Private note', '<p>Mine only</p>'),
  ('cccccccc-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   null, 'Scratch note', '<p>Delete me</p>');
update public.notes set deleted_at = now() where id = 'cccccccc-0000-4000-8000-000000000002';

insert into public.note_shares (id, note_id, shared_with, permission, created_by) values
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '22222222-2222-2222-2222-222222222222', 'edit', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001',
   '33333333-3333-3333-3333-333333333333', 'read', '11111111-1111-1111-1111-111111111111');

insert into public.note_tags (note_id, tag_id) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.attachments
  (id, note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000001.png',
   'photo.png', 'image/png', 1024);

-- ---------------------------------------------------------------------------
-- RLS is on for every user-data table.
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass),
  'RLS enabled on profiles');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.notebooks'::regclass),
  'RLS enabled on notebooks');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.tags'::regclass),
  'RLS enabled on tags');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.notes'::regclass),
  'RLS enabled on notes');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.note_tags'::regclass),
  'RLS enabled on note_tags');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.note_shares'::regclass),
  'RLS enabled on note_shares');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.attachments'::regclass),
  'RLS enabled on attachments');

-- ---------------------------------------------------------------------------
-- OWNER
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select is((select count(*) from public.profiles), 1::bigint,
  'owner sees only their own profile');
select is(
  (select count(*) from public.public_profiles
    where id in (
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444'
    )),
  4::bigint, 'owner sees the four fixture display names in the identity view');
select results_eq(
  $q$ with u as (update public.profiles set display_name = 'Owner renamed' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 1::bigint $q$,
  'owner can rename their own profile');
select throws_ok(
  $q$ update public.profiles set email = 'other@test.local'
      where id = '11111111-1111-1111-1111-111111111111' $q$,
  '42501', null, 'owner cannot change their own email');
select results_eq(
  $q$ with u as (update public.profiles set display_name = 'Hacked'
                 where id = '22222222-2222-2222-2222-222222222222' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 0::bigint $q$,
  'owner cannot rename another profile');

select is((select count(*) from public.notes), 4::bigint,
  'owner sees all four of their notes');
select lives_ok(
  $q$ with inserted as (
        insert into public.notes (title, body_html)
        values ('Owner insert', '<p>New</p>')
        returning id
      )
      delete from public.notes where id in (select id from inserted) $q$,
  'owner can insert a note and read the returned row');
select results_eq(
  $q$ with u as (update public.notes set title = 'Shared note edited'
                 where id = 'cccccccc-0000-4000-8000-000000000001' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 1::bigint $q$,
  'owner can update their own note directly');

select is((select count(*) from public.notebooks), 2::bigint,
  'owner sees both notebooks');
select results_eq(
  $q$ with d as (delete from public.notes where id = 'cccccccc-0000-4000-8000-000000000004' returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 1::bigint $q$,
  'owner can delete their own note');

select is((select count(*) from public.tags), 2::bigint,
  'owner sees both tags');
select is((select count(*) from public.note_tags), 1::bigint,
  'owner sees their note-tag link');

select is((select count(*) from public.note_shares), 2::bigint,
  'owner sees both share rows');
select results_eq(
  $q$ with u as (update public.note_shares set permission = 'edit'
                 where id = 'dddddddd-0000-4000-8000-000000000002' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 1::bigint $q$,
  'owner can change a share permission');
update public.note_shares set permission = 'read'
 where id = 'dddddddd-0000-4000-8000-000000000002';

select is((select count(*) from public.attachments), 1::bigint,
  'owner sees the attachment record');

reset role;

-- Anon must not be able to enumerate identities.
set local role anon;
set local "request.jwt.claims" = '{}';
select throws_ok('select count(*) from public.public_profiles', '42501',
  null, 'anon cannot read the identity view');
reset role;

-- ---------------------------------------------------------------------------
-- EDITOR
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';

select is((select count(*) from public.profiles), 1::bigint,
  'editor sees only their own profile');
select is((select count(*) from public.notes), 1::bigint,
  'editor sees only the shared active note');
select results_eq(
  $q$ with u as (update public.notes set title = 'Hacked' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 0::bigint $q$,
  'editor cannot update a note directly');
select results_eq(
  $q$ with d as (delete from public.notes returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 0::bigint $q$,
  'editor cannot delete a note directly');

select is((select count(*) from public.notebooks), 0::bigint,
  'editor sees none of the owner notebooks');
select results_eq(
  $q$ with u as (update public.notebooks set name = 'Hacked' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 0::bigint $q$,
  'editor cannot update an owner notebook');
select results_eq(
  $q$ with d as (delete from public.notebooks returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 0::bigint $q$,
  'editor cannot delete an owner notebook');

select is((select count(*) from public.tags), 0::bigint,
  'editor sees none of the owner tags');
select results_eq(
  $q$ with u as (update public.tags set name = 'Hacked' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 0::bigint $q$,
  'editor cannot update an owner tag');
select throws_ok(
  $q$ insert into public.note_tags (note_id, tag_id)
      values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002') $q$,
  '42501', null, 'editor cannot tag a shared note');
select is((select count(*) from public.note_tags), 0::bigint,
  'editor sees no note-tag links');

select is((select count(*) from public.note_shares), 1::bigint,
  'editor sees only their own share row');
select throws_ok(
  $q$ insert into public.note_shares (note_id, shared_with, permission, created_by)
      values ('cccccccc-0000-4000-8000-000000000001',
              '33333333-3333-3333-3333-333333333333', 'read',
              '22222222-2222-2222-2222-222222222222') $q$,
  '42501', null, 'editor cannot create a share');
select results_eq(
  $q$ with u as (update public.note_shares set permission = 'read' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 0::bigint $q$,
  'editor cannot change a share permission');
select results_eq(
  $q$ with d as (delete from public.note_shares returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 0::bigint $q$,
  'editor cannot revoke a share');

select is((select count(*) from public.attachments), 1::bigint,
  'editor can see attachments on the shared note');
select lives_ok(
  $q$ insert into public.attachments
        (note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
      values ('cccccccc-0000-4000-8000-000000000001',
              '22222222-2222-2222-2222-222222222222',
              'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000002.png',
              'draft.png', 'image/png', 2048) $q$,
  'editor can add an attachment record to the shared note');
select results_eq(
  $q$ with d as (delete from public.attachments where id = 'eeeeeeee-0000-4000-8000-000000000001' returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 0::bigint $q$,
  'editor cannot delete an attachment record');

reset role;

-- ---------------------------------------------------------------------------
-- READER
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';

select is((select count(*) from public.notes), 1::bigint,
  'reader sees only the shared active note');
select results_eq(
  $q$ with u as (update public.notes set title = 'Hacked' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 0::bigint $q$,
  'reader cannot update a note directly');
select results_eq(
  $q$ with d as (delete from public.notes returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 0::bigint $q$,
  'reader cannot delete a note directly');

select is((select count(*) from public.note_shares), 1::bigint,
  'reader sees only their own share row');
select results_eq(
  $q$ with u as (update public.note_shares set permission = 'edit' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 0::bigint $q$,
  'reader cannot grant themselves edit');

select is((select count(*) from public.attachments), 2::bigint,
  'reader can see attachments on the shared note');
select throws_ok(
  $q$ insert into public.attachments
        (note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
      values ('cccccccc-0000-4000-8000-000000000001',
              '33333333-3333-3333-3333-333333333333',
              'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000003.png',
              'nope.png', 'image/png', 2048) $q$,
  '42501', null, 'reader cannot add an attachment record');

reset role;

-- ---------------------------------------------------------------------------
-- STRANGER
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';

select is((select count(*) from public.profiles), 1::bigint,
  'stranger sees only their own profile');
select is((select count(*) from public.notes), 0::bigint,
  'stranger sees no notes');
select is((select count(*) from public.notebooks), 1::bigint,
  'stranger sees only their own notebook');
select is((select count(*) from public.note_shares), 0::bigint,
  'stranger sees no shares');
select is((select count(*) from public.attachments), 0::bigint,
  'stranger sees no attachments');
select results_eq(
  $q$ with u as (update public.notes set title = 'Hacked' returning 1)
      select count(*)::bigint from u $q$,
  $q$ select 0::bigint $q$,
  'stranger cannot update any note');
select results_eq(
  $q$ with d as (delete from public.notes returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 0::bigint $q$,
  'stranger cannot delete any note');

reset role;

-- ---------------------------------------------------------------------------
-- Owner-only integrity rules.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select throws_ok(
  $q$ update public.notebooks set parent_id = 'aaaaaaaa-0000-4000-8000-000000000003'
      where id = 'aaaaaaaa-0000-4000-8000-000000000001' $q$,
  '42501', null, 'a notebook cannot be parented under another owner notebook');

select throws_ok(
  $q$ insert into public.note_shares (note_id, shared_with, permission, created_by)
      values ('cccccccc-0000-4000-8000-000000000001',
              '11111111-1111-1111-1111-111111111111', 'read',
              '11111111-1111-1111-1111-111111111111') $q$,
  'P0001', null, 'owner cannot share a note with themselves');

select results_eq(
  $q$ with d as (delete from public.attachments where id = 'eeeeeeee-0000-4000-8000-000000000001' returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 1::bigint $q$,
  'owner can delete an attachment record');

select throws_ok(
  $q$ insert into public.attachments
        (note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
      values ('cccccccc-0000-4000-8000-000000000001',
              '11111111-1111-1111-1111-111111111111',
              'cccccccc-0000-4000-8000-000000000003/wrong.png',
              'wrong.png', 'image/png', 10) $q$,
  '23514', null, 'attachment path must start with its note id');

select throws_ok(
  $q$ insert into public.attachments
        (note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
      values ('cccccccc-0000-4000-8000-000000000001',
              '11111111-1111-1111-1111-111111111111',
              'cccccccc-0000-4000-8000-000000000001/huge.png',
              'huge.png', 'image/png', 20971521) $q$,
  '23514', null, 'attachment size is capped at 20 MB');

select is(
  (select notebook_id from public.notes
    where id = 'cccccccc-0000-4000-8000-000000000001'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'the fixture note starts in the notebook');
select results_eq(
  $q$ with d as (
        delete from public.notebooks
        where id = 'aaaaaaaa-0000-4000-8000-000000000001'
        returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 1::bigint $q$,
  'owner can delete a notebook');
select is(
  (select notebook_id from public.notes
    where id = 'cccccccc-0000-4000-8000-000000000001'),
  null, 'deleting a notebook moves its notes to Unfiled');
select is(
  (select parent_id from public.notebooks
    where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  null, 'deleting a parent notebook promotes its children');

reset role;

select * from finish();
rollback;
