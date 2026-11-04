-- Note writes work for the signed-in user.
--
-- This file is deliberately the first note write in its session. PL/pgSQL
-- caches prepare_note()'s plan and checks html_to_text()'s EXECUTE privilege
-- only when that plan is built, so any earlier note write by the database
-- owner warms the cache and hides a missing grant. That is how the missing
-- grant slipped through on 2026-11-03: production failed every note insert
-- with "permission denied for function html_to_text" while the fixture-fed
-- tests stayed green. Keep the first write here role-switched and cold.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'writer@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Writer"}');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"writer@test.local"}';

select lives_ok(
  $q$ insert into public.notes (title, body_html)
      values ('Signed-in insert', '<p>Hello <b>world</b></p>') $q$,
  'a signed-in user can insert a note');

select is(
  (select body_text from public.notes where title = 'Signed-in insert'),
  'Hello world', 'the note trigger derived plain text on insert');

select lives_ok(
  $q$ update public.notes set pinned = true where title = 'Signed-in insert' $q$,
  'a signed-in user can update their note directly');

select is(
  (select pinned from public.notes where title = 'Signed-in insert'),
  true, 'the direct update landed');

select * from finish();
rollback;
