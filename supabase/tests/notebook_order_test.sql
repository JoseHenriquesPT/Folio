-- Notebook reorder RPC: owner-only, complete sibling lists, atomic moves.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Stranger"}');

insert into public.notebooks (id, owner_id, parent_id, name, position) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', null, 'Work', 0),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', null, 'Personal', 1),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Projects', 0),
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Reading', 1),
  ('aaaaaaaa-0000-4000-8000-000000000005', '44444444-4444-4444-4444-444444444444', null, 'Elsewhere', 0);

-- ---------------------------------------------------------------------------
-- OWNER
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select results_eq(
  $q$ select id, position from public.reorder_notebooks(
        null,
        array['aaaaaaaa-0000-4000-8000-000000000002',
              'aaaaaaaa-0000-4000-8000-000000000001']::uuid[]
      ) order by position $q$,
  $q$ values
      ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, 0),
      ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 1) $q$,
  'owner can reorder the top level');

select results_eq(
  $q$ select id, parent_id, position from public.reorder_notebooks(
        'aaaaaaaa-0000-4000-8000-000000000001',
        array['aaaaaaaa-0000-4000-8000-000000000003',
              'aaaaaaaa-0000-4000-8000-000000000004',
              'aaaaaaaa-0000-4000-8000-000000000002']::uuid[]
      ) order by position $q$,
  $q$ values
      ('aaaaaaaa-0000-4000-8000-000000000003'::uuid,
       'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 0),
      ('aaaaaaaa-0000-4000-8000-000000000004'::uuid,
       'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 1),
      ('aaaaaaaa-0000-4000-8000-000000000002'::uuid,
       'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 2) $q$,
  'owner can nest a notebook as the last child');

select is(
  (select parent_id from public.notebooks
    where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'the moved notebook now lives under its new parent');

select throws_ok(
  $q$ select public.reorder_notebooks(
        null,
        array['aaaaaaaa-0000-4000-8000-000000000002',
              'aaaaaaaa-0000-4000-8000-000000000002']::uuid[]
      ) $q$,
  '23505', null, 'duplicate ids are refused');

select lives_ok(
  $q$ select public.reorder_notebooks(null, array[]::uuid[]) $q$,
  'an empty order is a no-op rather than an error');

select throws_ok(
  $q$ select public.reorder_notebooks(
        'aaaaaaaa-0000-4000-8000-000000000001',
        array['aaaaaaaa-0000-4000-8000-000000000003']::uuid[]
      ) $q$,
  '23514', null, 'the order must include every notebook already under the parent');

select throws_ok(
  $q$ select public.reorder_notebooks(
        'aaaaaaaa-0000-4000-8000-000000000003',
        array['aaaaaaaa-0000-4000-8000-000000000001']::uuid[]
      ) $q$,
  '23514', null, 'a notebook cannot be nested inside its own descendant');

reset role;

-- ---------------------------------------------------------------------------
-- STRANGER
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';

select throws_ok(
  $q$ select public.reorder_notebooks(
        null,
        array['aaaaaaaa-0000-4000-8000-000000000001',
              'aaaaaaaa-0000-4000-8000-000000000002']::uuid[]
      ) $q$,
  'P0002', null, 'a stranger cannot reorder another owner notebooks');

select throws_ok(
  $q$ select public.reorder_notebooks(
        'aaaaaaaa-0000-4000-8000-000000000005',
        array['aaaaaaaa-0000-4000-8000-000000000005']::uuid[]
      ) $q$,
  '23514', null, 'a parent cannot appear in its own order list');

reset role;

-- ---------------------------------------------------------------------------
-- ANON
-- ---------------------------------------------------------------------------
set local role anon;
set local "request.jwt.claims" = '{}';

select throws_ok(
  'select public.reorder_notebooks(null, array[]::uuid[])',
  '42501', null, 'anon cannot execute the reorder function');

reset role;

select * from finish();
rollback;
