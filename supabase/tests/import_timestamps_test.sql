-- Import timestamps: INSERT may restore Joplin's dates; UPDATE always stamps now().
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}');

insert into public.notes (id, owner_id, title, body_html, created_at, updated_at)
values
  ('cccccccc-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'Imported', '<p>Kept body</p>',
   '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');

select is(
  (select created_at from public.notes
   where id = 'cccccccc-0000-4000-8000-000000000001'),
  '2024-01-01T00:00:00Z'::timestamptz,
  'an imported created_at is preserved on insert');

select is(
  (select updated_at from public.notes
   where id = 'cccccccc-0000-4000-8000-000000000001'),
  '2024-02-01T00:00:00Z'::timestamptz,
  'an imported updated_at is preserved on insert');

select is(
  (select body_text from public.notes
   where id = 'cccccccc-0000-4000-8000-000000000001'),
  'Kept body',
  'plain text is still derived from the body');

insert into public.notes (id, owner_id, title)
values
  ('cccccccc-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'Fresh');

select ok(
  (select updated_at from public.notes
   where id = 'cccccccc-0000-4000-8000-000000000002') > now() - interval '1 minute',
  'a note without timestamps still defaults to now()');

update public.notes
set title = 'Edited', updated_at = '2024-03-01T00:00:00Z'
where id = 'cccccccc-0000-4000-8000-000000000001';

select ok(
  (select updated_at from public.notes
   where id = 'cccccccc-0000-4000-8000-000000000001') > now() - interval '1 minute',
  'an update ignores a supplied updated_at and stamps now()');

select * from finish();
rollback;
