-- Project-wide attachment usage totals.

begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}');

insert into public.notes (id, owner_id, title, body_html) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'First', '<p>One</p>'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Second', '<p>Two</p>');

insert into public.attachments
  (id, note_id, owner_id, storage_path, file_name, mime_type, size_bytes)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'cccccccc-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000001.png',
   'photo.png', 'image/png', 1000),
  ('eeeeeeee-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'cccccccc-0000-4000-8000-000000000002/eeeeeeee-0000-4000-8000-000000000002.pdf',
   'file.pdf', 'application/pdf', 2500);

select is(
  (select total_bytes from public.attachment_usage()),
  3500::bigint,
  'usage sums every attachment byte');

select is(
  (select attachment_count from public.attachment_usage()),
  2::bigint,
  'usage counts every attachment');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"other@test.local"}';
select is(
  (select total_bytes from public.attachment_usage()),
  3500::bigint,
  'any signed-in user sees the project total');
reset role;

select is(
  has_function_privilege('anon', 'public.attachment_usage()', 'execute'),
  false,
  'anon cannot read attachment usage');

select is(
  has_function_privilege('authenticated', 'public.attachment_usage()', 'execute'),
  true,
  'authenticated can read attachment usage');

select ok(
  (select prosecdef from pg_catalog.pg_proc where proname = 'attachment_usage'),
  'attachment_usage is security definer');

select * from finish();
rollback;
