-- Private attachment bucket, path parsing, and storage RLS.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

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

insert into public.notes (id, owner_id, title, body_html) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'With attachment', '<p>See file</p>');

insert into public.note_shares (note_id, shared_with, permission, created_by) values
  ('cccccccc-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'edit',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', 'read',
   '11111111-1111-1111-1111-111111111111');

-- The storage extension blocks direct deletes unless this test-only GUC is
-- set; RLS still applies to everything below.
select set_config('storage.allow_delete_query', 'true', true);

select ok(exists(select 1 from storage.buckets where id = 'note-attachments'),
  'the note-attachments bucket exists');
select is((select public from storage.buckets where id = 'note-attachments'),
  false, 'the note-attachments bucket is private');
select is((select file_size_limit from storage.buckets where id = 'note-attachments'),
  20971520::bigint, 'the bucket enforces the 20 MB limit');

select is(public.storage_note_id(
    'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000001.png'),
  'cccccccc-0000-4000-8000-000000000001'::uuid,
  'storage_note_id extracts the note id from a path');
select is(public.storage_note_id('not-a-note/file.png'), null,
  'storage_note_id rejects a path without a note uuid');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';
select is(public.can_read_note('cccccccc-0000-4000-8000-000000000001'), true,
  'owner can read their note');
select is(public.owns_note('cccccccc-0000-4000-8000-000000000001'), true,
  'owner owns their note');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select is(public.can_read_note('cccccccc-0000-4000-8000-000000000001'), true,
  'reader can read the shared note');
select is(public.can_edit_note('cccccccc-0000-4000-8000-000000000001'), false,
  'reader cannot edit the shared note');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';
select is(public.can_edit_note('cccccccc-0000-4000-8000-000000000001'), true,
  'editor can edit the shared note');
select is(public.owns_note('cccccccc-0000-4000-8000-000000000001'), false,
  'editor does not own the shared note');
reset role;

select ok(exists(select 1 from pg_catalog.pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'note_attachments_read'),
  'storage read policy exists');
select ok(exists(select 1 from pg_catalog.pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'note_attachments_upload'),
  'storage upload policy exists');
select ok(exists(select 1 from pg_catalog.pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'note_attachments_delete'),
  'storage delete policy exists');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select throws_ok(
  $q$ insert into storage.objects (bucket_id, name)
      values ('note-attachments',
              'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000010.png') $q$,
  '42501', null, 'reader cannot upload to a shared note');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';
select lives_ok(
  $q$ insert into storage.objects (bucket_id, name)
      values ('note-attachments',
              'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000011.png') $q$,
  'editor can upload to a shared note');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select is(
  (select count(*) from storage.objects
    where name = 'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000011.png'),
  1::bigint, 'reader can read the uploaded object');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';
select is(
  (select count(*) from storage.objects
    where name = 'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000011.png'),
  0::bigint, 'stranger cannot read the uploaded object');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';
select results_eq(
  $q$ with d as (
        delete from storage.objects
         where name = 'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000011.png'
         returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 0::bigint $q$,
  'editor cannot delete the uploaded object');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select results_eq(
  $q$ with d as (
        delete from storage.objects
         where name = 'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000011.png'
         returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 0::bigint $q$,
  'reader cannot delete the uploaded object');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';
select results_eq(
  $q$ with d as (
        delete from storage.objects
         where name = 'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000011.png'
         returning 1)
      select count(*)::bigint from d $q$,
  $q$ select 1::bigint $q$,
  'owner can delete the uploaded object');
reset role;

select * from finish();
rollback;
