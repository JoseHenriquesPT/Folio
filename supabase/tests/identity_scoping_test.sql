-- Identity scoping: who can resolve whose display name, and what the API
-- roles can never read. The identity view must run with the caller's RLS.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@identity.test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'partner@identity.test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Partner"}'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@identity.test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Stranger"}');

insert into public.notes (id, owner_id, title, body_html) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Shared', '<p>Hello</p>');

insert into public.note_shares (note_id, shared_with, permission, created_by) values
  ('cccccccc-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'read',
   '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- The view and the column surface.
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.public_profiles'::regclass
      and 'security_invoker=true' = any (reloptions)
  ),
  'the identity view runs with the caller''s RLS');
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'email', 'select'),
  'email is never exposed to API roles');
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'select'),
  'display_name stays readable through the identity surface');
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'id', 'select'),
  'profile ids stay readable through the identity surface');

-- ---------------------------------------------------------------------------
-- OWNER: sees own profile and recipients, never strangers.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@identity.test.local"}';

select is(
  (select count(*) from public.public_profiles
    where id in ('11111111-1111-1111-1111-111111111111',
                 '22222222-2222-2222-2222-222222222222',
                 '33333333-3333-3333-3333-333333333333')),
  2::bigint, 'owner resolves own and recipient identities only');
select is(
  (select display_name from public.public_profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'Partner', 'owner sees a recipient display name');
select is(
  (select display_name from public.public_profiles
    where id = '33333333-3333-3333-3333-333333333333'),
  null, 'owner cannot resolve an unrelated identity');
select throws_ok(
  $q$ select email from public.profiles
      where id = '11111111-1111-1111-1111-111111111111' $q$,
  '42501', null, 'the owner cannot read email through the API role');

-- ---------------------------------------------------------------------------
-- RECIPIENT: sees the owner of a note shared with them.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"partner@identity.test.local"}';

select is(
  (select count(*) from public.public_profiles
    where id in ('11111111-1111-1111-1111-111111111111',
                 '22222222-2222-2222-2222-222222222222',
                 '33333333-3333-3333-3333-333333333333')),
  2::bigint, 'recipient resolves own and owner identities only');
select is(
  (select display_name from public.public_profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'Owner', 'recipient sees the owner display name');

-- ---------------------------------------------------------------------------
-- STRANGER: sees nobody but themselves.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"stranger@identity.test.local"}';

select is(
  (select count(*) from public.public_profiles
    where id in ('11111111-1111-1111-1111-111111111111',
                 '22222222-2222-2222-2222-222222222222')),
  0::bigint, 'stranger resolves no unrelated identities');
select is(
  (select display_name from public.public_profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  null, 'stranger cannot resolve the owner identity');

-- ---------------------------------------------------------------------------
-- Revoking a share hides the identity in both directions.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@identity.test.local"}';
select lives_ok(
  $q$ delete from public.note_shares
      where note_id = 'cccccccc-0000-4000-8000-000000000001' $q$,
  'owner can revoke the share');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"partner@identity.test.local"}';
select is(
  (select count(*) from public.public_profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'a revoked recipient can no longer resolve the owner');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@identity.test.local"}';
select is(
  (select count(*) from public.public_profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  0::bigint, 'a revoked recipient is hidden from the owner');

-- ---------------------------------------------------------------------------
-- Display-name bounds.
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $q$ update public.profiles
      set display_name = repeat('x', 121)
      where id = '11111111-1111-1111-1111-111111111111' $q$,
  '23514', null, 'display_name is length-capped');

update public.profiles set display_name = ''
  where id = '33333333-3333-3333-3333-333333333333';
update auth.users
   set raw_user_meta_data = jsonb_build_object('full_name', repeat('y', 200))
 where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select char_length(display_name) from public.profiles
    where id = '33333333-3333-3333-3333-333333333333'),
  120, 'sign-up names are truncated to the cap');

-- ---------------------------------------------------------------------------
-- Trigger machinery is not an API surface.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.handle_auth_user()', 'execute'),
  'anon cannot execute handle_auth_user');
select ok(
  not has_function_privilege('anon', 'public.validate_note_share()', 'execute'),
  'anon cannot execute validate_note_share');
select ok(
  not has_function_privilege('anon', 'public.validate_notebook_parent()', 'execute'),
  'anon cannot execute validate_notebook_parent');
select ok(
  not has_function_privilege('anon', 'public.validate_note_notebook()', 'execute'),
  'anon cannot execute validate_note_notebook');
select ok(
  not has_function_privilege('authenticated', 'public.handle_auth_user()', 'execute'),
  'signed-in users cannot execute handle_auth_user');
select ok(
  not has_function_privilege('authenticated', 'public.validate_note_share()', 'execute'),
  'signed-in users cannot execute validate_note_share');
select ok(
  not has_function_privilege('authenticated', 'public.validate_notebook_parent()', 'execute'),
  'signed-in users cannot execute validate_notebook_parent');
select ok(
  not has_function_privilege('authenticated', 'public.validate_note_notebook()', 'execute'),
  'signed-in users cannot execute validate_note_notebook');
select ok(
  not has_function_privilege('anon', 'public.html_to_text(text)', 'execute'),
  'anon cannot execute html_to_text');
select ok(
  has_function_privilege('authenticated', 'public.html_to_text(text)', 'execute'),
  'note triggers can still derive plain text');
select ok(
  has_function_privilege('authenticated', 'public.save_note(uuid, integer, text, text)', 'execute'),
  'save_note stays callable by owners and editors');

select * from finish();
rollback;
