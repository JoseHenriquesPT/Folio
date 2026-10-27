-- Search: derived plain text, simple-config FTS, trigram fallback, RLS.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'reader@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Reader"}'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@test.local', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Stranger"}');

insert into public.notes (id, owner_id, title, body_html) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Notebook ideas', '<h1>Garden</h1><p>Tomatoes and basil</p>'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Private journal', '<p>secret thoughts</p>'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Trashed draft', '<p>tomatoes in the trash</p>'),
  ('cccccccc-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Garden plan', '<p>Tomato seedlings</p>'),
  ('cccccccc-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Entities', '<p>Fish &amp; chips&nbsp;today</p>'),
  ('cccccccc-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111',
   'Whitespace', '<p>A   B

C</p>');

update public.notes set deleted_at = now() where id = 'cccccccc-0000-4000-8000-000000000003';

insert into public.note_shares (note_id, shared_with, permission, created_by)
values ('cccccccc-0000-4000-8000-000000000001',
        '33333333-3333-3333-3333-333333333333', 'read',
        '11111111-1111-1111-1111-111111111111');

-- Derived plain text and entities.
select is((select body_text from public.notes where id = 'cccccccc-0000-4000-8000-000000000001'),
  'Garden Tomatoes and basil', 'body_text strips HTML tags');
select is((select body_text from public.notes where id = 'cccccccc-0000-4000-8000-000000000005'),
  'Fish & chips today', 'body_text decodes common entities');
select is((select body_text from public.notes where id = 'cccccccc-0000-4000-8000-000000000006'),
  'A B C', 'body_text collapses whitespace');

-- Full-text search.
select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'notebook') and deleted_at is null),
  1::bigint, 'search finds a title term');
select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'basil') and deleted_at is null),
  1::bigint, 'search finds a body term');
select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'notebook & garden') and deleted_at is null),
  1::bigint, 'search combines title and body terms');
select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'basils') and deleted_at is null),
  0::bigint, 'simple config does not stem basils to basil');

update public.notes set body_html = '<p>zucchini and secret thoughts</p>'
 where id = 'cccccccc-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'zucchini') and deleted_at is null),
  1::bigint, 'the search vector refreshes after an edit');

select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'tomatoes') and deleted_at is null),
  1::bigint, 'active-note search excludes trashed rows');

-- Trigram fallback for partial words.
select is(
  (select count(*) from public.notes
    where title operator(extensions.%) 'noteb' and deleted_at is null),
  1::bigint, 'trigram fallback finds a partial title');
select is(
  (select count(*) from public.notes
    where extensions.word_similarity('tomatoe', body_text) > 0.3
      and deleted_at is null),
  2::bigint, 'trigram word similarity finds partial body words');
select ok(
  extensions.similarity('Notebook ideas', 'noteb') >= 0.3,
  'trigram similarity passes the default threshold for short partials');

-- RLS applies to search too.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reader@test.local"}';

select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'notebook') and deleted_at is null),
  1::bigint, 'reader can search a shared note');
select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'secret') and deleted_at is null),
  0::bigint, 'reader cannot search a private note');

reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"stranger@test.local"}';
select is(
  (select count(*) from public.notes
    where search @@ to_tsquery('simple', 'notebook') and deleted_at is null),
  0::bigint, 'stranger search returns nothing');
reset role;

select * from finish();
rollback;
