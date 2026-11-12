-- Notebook sharing: a share covers the whole subtree, recipients edit note
-- content only, and membership, tags, pin/archive/trash and re-sharing stay
-- owner-only. Effective permission is the strongest of the note and notebook
-- grants.
begin;
create extension if not exists pgtap with schema extensions;

select plan(64);

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
   null, 'Shared Root'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Shared Child'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'Shared Grand'),
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   null, 'Private');

insert into public.notes (id, owner_id, notebook_id, title, body_html) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Root note', '<p>root</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'Child note', '<p>child</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000003', 'Grand note', '<p>grand</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000004', 'Other note', '<p>other</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'Trashed note', '<p>gone</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Direct read note', '<p>read</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000007', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'Direct edit note', '<p>edit</p>'),
  ('bbbbbbbb-0000-4000-8000-000000000008', '11111111-1111-1111-1111-111111111111',
   null, 'Unfiled note', '<p>unfiled</p>');

update public.notes set deleted_at = now()
 where id = 'bbbbbbbb-0000-4000-8000-000000000005';

insert into public.tags (id, owner_id, name) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'keep');

insert into public.note_shares (note_id, shared_with, permission, created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000006', '22222222-2222-2222-2222-222222222222',
   'read', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-000000000007', '33333333-3333-3333-3333-333333333333',
   'edit', '11111111-1111-1111-1111-111111111111');

insert into public.notebook_shares (notebook_id, shared_with, permission, created_by) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222',
   'edit', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333',
   'read', '11111111-1111-1111-1111-111111111111');

-- Owner view.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select is((select count(*) from public.notebook_shares), 2::bigint,
  'owner sees both notebook share rows');
select throws_ok(
  $q$ insert into public.notebook_shares (notebook_id, shared_with, permission, created_by)
      values ('aaaaaaaa-0000-4000-8000-000000000001',
              '11111111-1111-1111-1111-111111111111', 'read',
              '11111111-1111-1111-1111-111111111111') $q$,
  'P0001', null, 'a notebook cannot be shared with its owner');
select throws_ok(
  $q$ insert into public.notebook_shares (notebook_id, shared_with, permission, created_by)
      values ('aaaaaaaa-0000-4000-8000-000000000001',
              '44444444-4444-4444-4444-444444444444', 'read',
              '22222222-2222-2222-2222-222222222222') $q$,
  '42501', null, 'created_by must be the notebook owner');
select is((select public.my_note_share_permission('bbbbbbbb-0000-4000-8000-000000000002')),
  null::text, 'the owner holds no share permission');
select is((select public.notebook_share_count('bbbbbbbb-0000-4000-8000-000000000002')),
  2, 'a note counts the shares on its ancestor notebooks');
select is((select public.notebook_share_count('bbbbbbbb-0000-4000-8000-000000000004')),
  0, 'a note outside a shared subtree counts zero');
select is((select count(*) from public.profiles
           where id = '22222222-2222-2222-2222-222222222222'), 1::bigint,
  'the owner can resolve a notebook recipient');
select is((select count(*) from public.profiles
           where id = '44444444-4444-4444-4444-444444444444'), 0::bigint,
  'a user with no share relationship stays invisible');

reset role;

-- Editor view: the notebook is shared with edit over the whole subtree.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"editor@test.local"}';

select is((select count(*) from public.notebooks), 3::bigint,
  'the editor sees the shared subtree');
select is((select count(*) from public.notebooks
           where id = 'aaaaaaaa-0000-4000-8000-000000000004'), 0::bigint,
  'the editor cannot see a notebook outside the subtree');
select is((select count(*) from public.notes
           where owner_id = '11111111-1111-1111-1111-111111111111'), 5::bigint,
  'the editor sees every untrashed note in the subtree');
select is((select count(*) from public.notes
           where id = 'bbbbbbbb-0000-4000-8000-000000000005'), 0::bigint,
  'a trashed note stays hidden from the editor');
select is((select count(*) from public.notes
           where id = 'bbbbbbbb-0000-4000-8000-000000000004'), 0::bigint,
  'a note outside the subtree stays hidden from the editor');
select is((select count(*) from public.notes
           where id = 'bbbbbbbb-0000-4000-8000-000000000008'), 0::bigint,
  'an unfiled note stays hidden from the editor');
select is((select public.can_read_note('bbbbbbbb-0000-4000-8000-000000000003')),
  true, 'the editor can read a grandchild note');
select is((select public.can_edit_note('bbbbbbbb-0000-4000-8000-000000000003')),
  true, 'the editor can edit a grandchild note');
select is(
  (select public.my_note_share_permission('bbbbbbbb-0000-4000-8000-000000000002')),
  'edit', 'the notebook permission reaches the editor');
select is(
  (select public.my_note_share_permission('bbbbbbbb-0000-4000-8000-000000000006')),
  'edit', 'notebook edit beats a weaker direct read share');
select is(
  (select version from public.save_note('bbbbbbbb-0000-4000-8000-000000000003',
    1, null, '<p>edited</p>')),
  2, 'the editor can save deep in the subtree');
select throws_ok(
  $q$ insert into public.notes (owner_id, notebook_id, title, body_html)
      values ('22222222-2222-2222-2222-222222222222',
              'aaaaaaaa-0000-4000-8000-000000000001', 'New', '<p>x</p>') $q$,
  '42501', null, 'an editor cannot create notes in a shared notebook');

update public.notes
   set notebook_id = 'aaaaaaaa-0000-4000-8000-000000000004'
 where id = 'bbbbbbbb-0000-4000-8000-000000000002';
select is((select notebook_id from public.notes
           where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'aaaaaaaa-0000-4000-8000-000000000002'::uuid,
  'an editor cannot move a note out of the shared notebook');

update public.notes set deleted_at = now()
 where id = 'bbbbbbbb-0000-4000-8000-000000000002';
select is((select deleted_at from public.notes
           where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  null::timestamptz, 'an editor cannot trash a note');

update public.notes set pinned = true
 where id = 'bbbbbbbb-0000-4000-8000-000000000002';
select is((select pinned from public.notes
           where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  false, 'an editor cannot pin a note');

select throws_ok(
  $q$ insert into public.note_tags (note_id, tag_id)
      values ('bbbbbbbb-0000-4000-8000-000000000002',
              'cccccccc-0000-4000-8000-000000000001') $q$,
  '42501', null, 'an editor cannot tag a shared note');
select throws_ok(
  $q$ insert into public.note_shares (note_id, shared_with, permission, created_by)
      values ('bbbbbbbb-0000-4000-8000-000000000002',
              '44444444-4444-4444-4444-444444444444', 'read',
              '22222222-2222-2222-2222-222222222222') $q$,
  '42501', null, 'an editor cannot re-share a shared note');
select throws_ok(
  $q$ insert into public.notebook_shares (notebook_id, shared_with, permission, created_by)
      values ('aaaaaaaa-0000-4000-8000-000000000001',
              '44444444-4444-4444-4444-444444444444', 'read',
              '22222222-2222-2222-2222-222222222222') $q$,
  '42501', null, 'an editor cannot re-share the notebook');

-- Both attempts below affect zero rows. The editor cannot see other
-- recipients' share rows, so the owner block later proves nothing changed.
update public.notebook_shares set permission = 'edit'
 where notebook_id = 'aaaaaaaa-0000-4000-8000-000000000001'
   and shared_with = '33333333-3333-3333-3333-333333333333';

delete from public.notebook_shares
 where notebook_id = 'aaaaaaaa-0000-4000-8000-000000000001'
   and shared_with = '33333333-3333-3333-3333-333333333333';
select is((select count(*) from public.notebook_shares), 1::bigint,
  'an editor sees only their own share row');

update public.notebooks set name = 'Renamed'
 where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is((select name from public.notebooks
           where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Shared Root', 'an editor cannot rename a shared notebook');

delete from public.notebooks
 where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is((select count(*) from public.notebooks
           where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1::bigint,
  'an editor cannot delete a shared notebook');

select throws_ok(
  $q$ select * from public.reorder_notebooks(
        'aaaaaaaa-0000-4000-8000-000000000001',
        array['aaaaaaaa-0000-4000-8000-000000000002'::uuid,
              'aaaaaaaa-0000-4000-8000-000000000003'::uuid]) $q$,
  'P0002', null, 'an editor cannot reorder a shared notebook');

insert into public.attachments
  (id, note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
values
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002',
   '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-4000-8000-000000000002/att.png', 'att.png', 'image/png', 128);
select is((select count(*) from public.attachments
           where note_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 1::bigint,
  'an editor can attach a file to a shared note');

delete from public.attachments
 where id = 'dddddddd-0000-4000-8000-000000000001';
select is((select count(*) from public.attachments
           where id = 'dddddddd-0000-4000-8000-000000000001'), 1::bigint,
  'an editor cannot delete attachment records');

select is((select count(*) from public.profiles
           where id = '11111111-1111-1111-1111-111111111111'), 1::bigint,
  'the editor can resolve the notebook owner');
select is(
  (select my_share_permission from public.note_summaries
   where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'edit', 'note_summaries reports the notebook-inherited permission');

reset role;

-- Reader view: read over the subtree, with one stronger direct share.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';

select is((select count(*) from public.notes
           where owner_id = '11111111-1111-1111-1111-111111111111'), 5::bigint,
  'the reader sees every untrashed note in the subtree');
select is((select public.can_read_note('bbbbbbbb-0000-4000-8000-000000000002')),
  true, 'the reader can read a shared note');
select is((select public.can_edit_note('bbbbbbbb-0000-4000-8000-000000000002')),
  false, 'the reader cannot edit a read-only shared note');
select is(
  (select public.my_note_share_permission('bbbbbbbb-0000-4000-8000-000000000002')),
  'read', 'the notebook permission is read');
select is(
  (select public.my_note_share_permission('bbbbbbbb-0000-4000-8000-000000000007')),
  'edit', 'a stronger direct share beats the notebook read');
select throws_ok(
  $q$ select * from public.save_note('bbbbbbbb-0000-4000-8000-000000000002',
        1, null, '<p>x</p>') $q$,
  '42501', null, 'a read-only recipient cannot save');
select is(
  (select version from public.save_note('bbbbbbbb-0000-4000-8000-000000000007',
    1, null, '<p>edited</p>')),
  2, 'a stronger direct edit share still allows saving');
select is((select count(*) from public.notebooks), 3::bigint,
  'the reader sees the shared subtree');
select throws_ok(
  $q$ insert into public.attachments
        (note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
      values ('bbbbbbbb-0000-4000-8000-000000000002',
              '33333333-3333-3333-3333-333333333333',
              'bbbbbbbb-0000-4000-8000-000000000002/att2.png', 'att2.png',
              'image/png', 128) $q$,
  '42501', null, 'a read-only recipient cannot attach');

reset role;

-- Stranger view: nothing.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';

select is((select count(*) from public.notes
           where owner_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'a stranger sees none of the owner notes');
select is((select count(*) from public.notebooks), 0::bigint,
  'a stranger sees none of the owner notebooks');
select is((select public.my_note_share_permission('bbbbbbbb-0000-4000-8000-000000000002')),
  null::text, 'a stranger holds no share permission');
select is((select count(*) from public.profiles
           where id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'a stranger cannot resolve the owner');
select throws_ok(
  $q$ insert into public.notebook_shares (notebook_id, shared_with, permission, created_by)
      values ('aaaaaaaa-0000-4000-8000-000000000001',
              '44444444-4444-4444-4444-444444444444', 'read',
              '44444444-4444-4444-4444-444444444444') $q$,
  '42501', null, 'a stranger cannot create notebook shares');

reset role;

-- Mid-tree sharing and revocation.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

insert into public.notebook_shares (notebook_id, shared_with, permission, created_by)
values ('aaaaaaaa-0000-4000-8000-000000000002',
        '44444444-4444-4444-4444-444444444444', 'read',
        '11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.notebook_shares
           where shared_with = '44444444-4444-4444-4444-444444444444'), 1::bigint,
  'sharing a child notebook works');
select is((select permission from public.notebook_shares
           where notebook_id = 'aaaaaaaa-0000-4000-8000-000000000001'
             and shared_with = '33333333-3333-3333-3333-333333333333'),
  'read', 'the editor could not change a notebook share');
select is((select count(*) from public.notebook_shares
           where shared_with = '33333333-3333-3333-3333-333333333333'), 1::bigint,
  'the editor could not revoke a notebook share');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';

select is((select count(*) from public.notes
           where owner_id = '11111111-1111-1111-1111-111111111111'), 3::bigint,
  'the stranger sees the child subtree notes');
select is((select count(*) from public.notebooks), 2::bigint,
  'the stranger sees the child and grand notebooks');
select is(
  (select public.my_note_share_permission('bbbbbbbb-0000-4000-8000-000000000003')),
  'read', 'the stranger inherits read on the grandchild note');
select is((select count(*) from public.notes
           where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0::bigint,
  'the parent note stays hidden');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

delete from public.notebook_shares
 where notebook_id = 'aaaaaaaa-0000-4000-8000-000000000001'
   and shared_with = '33333333-3333-3333-3333-333333333333';
select is((select count(*) from public.notebook_shares
           where shared_with = '33333333-3333-3333-3333-333333333333'), 0::bigint,
  'the owner can revoke a notebook share');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';

select is((select count(*) from public.notes
           where owner_id = '11111111-1111-1111-1111-111111111111'), 1::bigint,
  'revoking the notebook share leaves only the direct note share');
select is((select public.my_note_share_permission('bbbbbbbb-0000-4000-8000-000000000002')),
  null::text, 'the revoked reader loses the inherited permission');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.local"}';

select is((select public.notebook_share_count('bbbbbbbb-0000-4000-8000-000000000001')),
  1, 'the root note counts only the remaining root share');
select is((select public.notebook_share_count('bbbbbbbb-0000-4000-8000-000000000003')),
  2, 'a grandchild note counts shares across the whole ancestor chain');

reset role;

-- EXECUTE grants follow the 0014 convention: explicit grants, internals stay
-- locked away. has_function_privilege is callable in any role.
select is(
  (select has_function_privilege('authenticated',
     'public.my_note_share_permission(uuid)', 'execute')),
  true, 'authenticated can call my_note_share_permission');
select is(
  (select has_function_privilege('anon',
     'public.my_note_share_permission(uuid)', 'execute')),
  false, 'anon cannot call my_note_share_permission');
select is(
  (select has_function_privilege('authenticated',
     'public.notebook_ancestor_ids(uuid)', 'execute')),
  false, 'notebook_ancestor_ids stays internal');
select is(
  (select has_function_privilege('authenticated',
     'public.can_read_notebook(uuid)', 'execute')),
  true, 'authenticated can call can_read_notebook');

select * from finish();
rollback;
