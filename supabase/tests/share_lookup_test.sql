-- Share lookup, upsert, revocation, and self-share rules.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

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
   'Shared', '<p>Hello</p>'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Trashed shared', '<p>Gone</p>'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Revoked', '<p>Soon hidden</p>');
update public.notes set deleted_at = now() where id = 'cccccccc-0000-4000-8000-000000000002';

insert into public.note_shares (note_id, shared_with, permission, created_by) values
  ('cccccccc-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'edit',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', 'read',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'read',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000003', '22222222-2222-2222-2222-222222222222', 'edit',
   '11111111-1111-1111-1111-111111111111');

-- The profile trigger lowercases the stored email.
select is((select email from public.profiles
           where id = '22222222-2222-2222-2222-222222222222'),
  'editor@test.local', 'profile email is stored lowercased');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select is((select count(*) from public.find_profile_by_email('editor@test.local')), 1::bigint,
  'exact email lookup returns one profile');
select is((select id from public.find_profile_by_email('editor@test.local')),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'lookup returns the matching profile id');
select is((select display_name from public.find_profile_by_email('editor@test.local')),
  'Editor', 'lookup returns only the display name');
select is((select count(*) from public.find_profile_by_email('  Editor@Test.Local  ')), 1::bigint,
  'lookup trims and lowercases the input');
select is((select count(*) from public.find_profile_by_email('editor')), 0::bigint,
  'partial email lookup returns nothing');
select is((select count(*) from public.find_profile_by_email('nobody@test.local')), 0::bigint,
  'unknown email returns nothing');

select is((select count(*) from public.note_shares), 4::bigint,
  'owner sees every share row');
select is(
  (select permission from public.note_shares
    where note_id = 'cccccccc-0000-4000-8000-000000000001'
      and shared_with = '33333333-3333-3333-3333-333333333333'),
  'read', 'owner can read the current permission');

-- Duplicate share updates the existing row.
insert into public.note_shares (note_id, shared_with, permission, created_by)
values ('cccccccc-0000-4000-8000-000000000001',
        '33333333-3333-3333-3333-333333333333', 'edit',
        '11111111-1111-1111-1111-111111111111')
on conflict (note_id, shared_with)
do update set permission = excluded.permission, updated_at = now();

select is(
  (select permission from public.note_shares
    where note_id = 'cccccccc-0000-4000-8000-000000000001'
      and shared_with = '33333333-3333-3333-3333-333333333333'),
  'edit', 'a duplicate share updates the existing permission');

select throws_ok(
  $q$ insert into public.note_shares (note_id, shared_with, permission, created_by)
      values ('cccccccc-0000-4000-8000-000000000001',
              '11111111-1111-1111-1111-111111111111', 'read',
              '11111111-1111-1111-1111-111111111111') $q$,
  'P0001', null, 'a note cannot be shared with its owner');

select throws_ok(
  $q$ insert into public.note_shares (note_id, shared_with, permission, created_by)
      values ('cccccccc-0000-4000-8000-000000000001',
              '99999999-9999-9999-9999-999999999999', 'read',
              '11111111-1111-1111-1111-111111111111') $q$,
  '23503', null, 'sharing with a missing profile fails');

select throws_ok(
  $q$ insert into public.note_shares (note_id, shared_with, permission, created_by)
      values ('cccccccc-0000-4000-8000-000000000001',
              '44444444-4444-4444-4444-444444444444', 'read',
              '22222222-2222-2222-2222-222222222222') $q$,
  '42501', null, 'created_by must be the owner');

reset role;

-- Editor view.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';

select is((select count(*) from public.find_profile_by_email('stranger@test.local')), 1::bigint,
  'authenticated users can look up another exact email');
select is((select count(*) from public.note_shares), 3::bigint,
  'editor sees only their own share rows');
select is((select count(*) from public.notes where id = 'cccccccc-0000-4000-8000-000000000002'),
  0::bigint, 'a trashed note disappears from the recipient');
select throws_ok(
  $q$ insert into public.note_shares (note_id, shared_with, permission, created_by)
      values ('cccccccc-0000-4000-8000-000000000001',
              '44444444-4444-4444-4444-444444444444', 'read',
              '22222222-2222-2222-2222-222222222222') $q$,
  '42501', null, 'a recipient cannot create shares');

reset role;

-- Reader view: upgraded to edit can read, then loses access when revoked.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';
select is((select count(*) from public.notes where id = 'cccccccc-0000-4000-8000-000000000001'),
  1::bigint, 'reader sees the shared note after the upgrade');
select is((select count(*) from public.note_shares), 1::bigint,
  'reader sees only their own share row');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';
select is((select count(*) from public.note_shares where note_id = 'cccccccc-0000-4000-8000-000000000002'),
  1::bigint, 'owner still sees share rows for a trashed note');

delete from public.note_shares
 where note_id = 'cccccccc-0000-4000-8000-000000000003'
   and shared_with = '22222222-2222-2222-2222-222222222222';

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';
select is((select count(*) from public.notes where id = 'cccccccc-0000-4000-8000-000000000003'),
  0::bigint, 'revoking a share removes access immediately');

reset role;

-- Anonymous lookup is not allowed.
set local role anon;
set local "request.jwt.claims" = '{}';
select throws_ok(
  $q$ select * from public.find_profile_by_email('editor@test.local') $q$,
  '42501', null, 'anonymous callers cannot run email lookup');
reset role;

select * from finish();
rollback;
