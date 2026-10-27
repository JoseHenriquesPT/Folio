-- List views: tags, badges, filtering, and RLS through security_invoker.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

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

insert into public.tags (id, owner_id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Design'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'Ideas');

insert into public.notes (id, owner_id, title, body_html) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Shared note', '<p>Hello</p>'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Private note', '<p>Mine</p>'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Trashed note', '<p>Gone</p>');
update public.notes set deleted_at = now() where id = 'cccccccc-0000-4000-8000-000000000003';

insert into public.note_tags (note_id, tag_id) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002');

insert into public.note_shares (note_id, shared_with, permission, created_by) values
  ('cccccccc-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'edit',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', 'read',
   '11111111-1111-1111-1111-111111111111');

insert into public.attachments
  (note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
values
  ('cccccccc-0000-4000-8000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000001.png',
   'photo.png', 'image/png', 1024);

-- Owner.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select is((select count(*) from public.note_summaries), 3::bigint,
  'owner sees all own notes including trash');
select is(
  (select jsonb_array_length(tags) from public.note_summaries
    where id = 'cccccccc-0000-4000-8000-000000000001'),
  1, 'owner sees the tag on a note card');
select is(
  (select tags -> 0 ->> 'name' from public.note_summaries
    where id = 'cccccccc-0000-4000-8000-000000000001'),
  'Design', 'the card carries the tag name');
select is(
  (select attachment_count from public.note_summaries
    where id = 'cccccccc-0000-4000-8000-000000000001'),
  1, 'the card carries the attachment count');
select is(
  (select share_count from public.note_summaries
    where id = 'cccccccc-0000-4000-8000-000000000001'),
  2, 'the card carries the share count');
select is(
  (select count(*) from public.note_summaries
    where tag_ids @> array['bbbbbbbb-0000-4000-8000-000000000001']::uuid[]),
  1::bigint, 'tag filtering happens in the database');
select is(
  (select note_count from public.tag_summaries
    where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  1, 'tag summaries count linked notes');

reset role;

-- Editor.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';

select is((select count(*) from public.note_summaries), 1::bigint,
  'editor sees only the shared note');
select is(
  (select jsonb_array_length(tags) from public.note_summaries
    where id = 'cccccccc-0000-4000-8000-000000000001'),
  0, 'editor cannot see owner tags through the card');
select is(
  (select share_count from public.note_summaries
    where id = 'cccccccc-0000-4000-8000-000000000001'),
  1, 'editor sees only their own share row');
select is((select count(*) from public.tag_summaries), 0::bigint,
  'editor sees no tag summaries');

reset role;

-- Reader and stranger.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select is((select count(*) from public.note_summaries), 1::bigint,
  'reader sees the shared note card');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';
select is((select count(*) from public.note_summaries), 0::bigint,
  'stranger sees no note cards');
reset role;

select * from finish();
rollback;
