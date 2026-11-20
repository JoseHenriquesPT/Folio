-- Notebook bulk archive: one owner action archives every active note in a
-- notebook subtree, leaves trash and other notebooks alone, and is reversible.
-- Recipients of a notebook share, strangers and anon can never run it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

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
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   null, 'Work'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Projects'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'Deep'),
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   null, 'Personal'),
  ('aaaaaaaa-0000-4000-8000-000000000005', '44444444-4444-4444-4444-444444444444',
   null, 'Elsewhere');

insert into public.notes (id, owner_id, notebook_id, title, body_html) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Root note', '<p>root</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'Child note', '<p>child</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000003', 'Grand note', '<p>grand</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'Already archived', '<p>old</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Trashed note', '<p>gone</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000004', 'Personal note', '<p>mine</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000007', '44444444-4444-4444-4444-444444444444',
   'aaaaaaaa-0000-4000-8000-000000000005', 'Stranger note', '<p>theirs</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000008', '11111111-1111-1111-1111-111111111111',
   null, 'Unfiled note', '<p>loose</p>');

update public.notes set archived = true
 where id = 'bbbbbbbb-0000-4000-8000-000000000004';
update public.notes set deleted_at = now()
 where id = 'bbbbbbbb-0000-4000-8000-000000000005';

insert into public.notebook_shares (notebook_id, shared_with, permission, created_by) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222',
   'edit', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333',
   'read', '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- OWNER
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select is(
  public.set_notebook_archived('aaaaaaaa-0000-4000-8000-000000000001', true),
  3,
  'archiving Work counts only the active notes that changed');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  true, 'the notebook own active note is archived');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  true, 'a child notebook note is archived');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000003'),
  true, 'a grandchild notebook note is archived');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000004'),
  true, 'a note archived before the bulk action stays archived');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000005'),
  false, 'a trashed note keeps its archive flag');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000006'),
  false, 'a different notebook is untouched');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000008'),
  false, 'an unfiled note is untouched');

select is(
  public.set_notebook_archived('aaaaaaaa-0000-4000-8000-000000000001', true),
  0,
  'archiving again changes nothing');

select is(
  public.set_notebook_archived('aaaaaaaa-0000-4000-8000-000000000001', false),
  4,
  'unarchiving Work restores every active note, including the earlier one');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  false, 'the root note is unarchived');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  false, 'the child note is unarchived');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000003'),
  false, 'the grandchild note is unarchived');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000004'),
  false, 'the earlier archived note is also unarchived');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000005'),
  false, 'the trashed note is still outside the bulk action');

select is(
  public.set_notebook_archived('aaaaaaaa-0000-4000-8000-000000000002', true),
  3,
  'archiving from a sub-notebook covers that subtree only');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  false, 'the parent notebook note stays active');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  true, 'the child note is archived by the sub-notebook action');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000003'),
  true, 'the grandchild note is archived by the sub-notebook action');

select is(
  public.set_notebook_archived('aaaaaaaa-0000-4000-8000-000000000002', false),
  3,
  'unarchiving the sub-notebook restores its three notes');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  false, 'the child note is active again');
select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000003'),
  false, 'the grandchild note is active again');

select throws_ok(
  $q$ select public.set_notebook_archived(gen_random_uuid(), true) $q$,
  '42501', null, 'a missing notebook is refused without leaking existence');
select throws_ok(
  $q$ select public.set_notebook_archived(
        'aaaaaaaa-0000-4000-8000-000000000005', true) $q$,
  '42501', null, 'another owner notebook is refused');

select ok(
  has_function_privilege(
    'authenticated',
    'public.set_notebook_archived(uuid, boolean)',
    'execute'
  ),
  'authenticated can execute the bulk archive function');
select ok(
  not has_function_privilege(
    'anon',
    'public.set_notebook_archived(uuid, boolean)',
    'execute'
  ),
  'anon cannot execute the bulk archive function');

reset role;

-- ---------------------------------------------------------------------------
-- RECIPIENTS OF A NOTEBOOK SHARE
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';

select throws_ok(
  $q$ select public.set_notebook_archived(
        'aaaaaaaa-0000-4000-8000-000000000001', true) $q$,
  '42501', null, 'an editor of a shared notebook cannot archive it');
select is(
  (select count(*) from public.notes
    where notebook_id = 'aaaaaaaa-0000-4000-8000-000000000001'
      and archived),
  0::bigint, 'the refused editor changed nothing');

reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';

select throws_ok(
  $q$ select public.set_notebook_archived(
        'aaaaaaaa-0000-4000-8000-000000000001', true) $q$,
  '42501', null, 'a reader of a shared notebook cannot archive it');

reset role;

-- ---------------------------------------------------------------------------
-- STRANGER
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';

select is(
  (select archived from public.notes
    where id = 'bbbbbbbb-0000-4000-8000-000000000007'),
  false, 'the bulk action never touched another owner note');
select throws_ok(
  $q$ select public.set_notebook_archived(
        'aaaaaaaa-0000-4000-8000-000000000001', true) $q$,
  '42501', null, 'a stranger cannot archive another owner notebook');

reset role;

-- ---------------------------------------------------------------------------
-- ANON
-- ---------------------------------------------------------------------------
set local role anon;
set local "request.jwt.claims" = '{}';

select throws_ok(
  $q$ select public.set_notebook_archived(
        'aaaaaaaa-0000-4000-8000-000000000001', true) $q$,
  '42501', null, 'anon cannot execute the bulk archive function');

reset role;

select * from finish();
rollback;
