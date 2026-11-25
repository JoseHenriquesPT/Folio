-- External access tokens: per-account self-service, hashed at rest, scoped,
-- expiring, revocable, and isolated between accounts. The tool RPCs arrive in
-- 8.2/8.3; this file is the access-control gate for the token layer.
begin;
create extension if not exists pgtap with schema extensions;

select plan(58);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@api.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"API Owner"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'partner@api.test', 'x', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"API Partner"}');

-- First account view.
set local "request.jwt.claims" =
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"owner@api.test"}';
select is((select public.can_manage_api_tokens()), true,
  'a signed-in account can manage its tokens');

create temp table owner_token as
select * from public.create_api_token('Desktop', 'read', now() + interval '30 days');
select is((select count(*) from owner_token), 1::bigint,
  'the owner can create a token');
select is((select token like 'folio_pat_%' from owner_token), true,
  'the raw token uses the folio_pat_ prefix');
select is((select length(token) from owner_token), 74,
  'the token carries 32 random bytes as hex');
select is((select prefix = left(token, 16) from owner_token), true,
  'the stored prefix matches the raw token');
select is(
  (select t.owner_id from public.api_tokens t
    join owner_token o on o.id = t.id),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'the token belongs to the signed-in owner');
select is(
  (select t.scope from public.api_tokens t
    join owner_token o on o.id = t.id),
  'read', 'the token stores its read scope');
select is(
  (select t.token_hash = encode(extensions.digest(o.token, 'sha256'), 'hex')
   from public.api_tokens t join owner_token o on o.id = t.id),
  true, 'only the SHA-256 hash is stored');
select is(
  (select t.token_hash <> o.token from public.api_tokens t
    join owner_token o on o.id = t.id),
  true, 'the raw token is never stored');

select is((select count(*) from public.list_api_tokens()), 1::bigint,
  'the owner lists their token');
select is(
  (select calls_today from public.list_api_tokens()
    where id = (select id from owner_token)),
  0, 'a new token has no calls today');
select is(
  (select name from public.list_api_tokens()
    where id = (select id from owner_token)),
  'Desktop', 'the list returns the token name');

-- Second account view: self-service, isolated from the first account.
set local "request.jwt.claims" =
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"partner@api.test"}';
select is((select public.can_manage_api_tokens()), true,
  'a second account can manage its tokens');
create temp table partner_token as
select * from public.create_api_token('Partner desktop', 'read',
  now() + interval '30 days');
select is((select count(*) from partner_token), 1::bigint,
  'the second account can create a token');
select is(
  (select t.owner_id from public.api_tokens t
    join partner_token p on p.id = t.id),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'the partner token belongs to the partner');
select is((select count(*) from public.list_api_tokens()), 1::bigint,
  'the partner lists only their own token');
select is(
  (select count(*) from public.list_api_tokens()
    where id = (select id from owner_token)),
  0::bigint, 'the partner cannot see the first account token');
select is(
  (select count(*) from public.list_api_tokens()
    where id = (select id from partner_token)),
  1::bigint, 'the partner sees their own token');

select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from partner_token))::text, true);
select is(
  (select owner_id from public.api_authenticate('read')),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'the partner token authenticates the partner account');

-- Back to the first account for validation and write-token tests.
set local "request.jwt.claims" =
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"owner@api.test"}';
select throws_ok(
  $q$ select * from public.create_api_token('Bad scope', 'admin',
       now() + interval '30 days') $q$,
  '22023', null, 'an unknown scope is rejected');
select throws_ok(
  $q$ select * from public.create_api_token('   ', 'read',
       now() + interval '30 days') $q$,
  '22023', null, 'an empty name is rejected');
select throws_ok(
  $q$ select * from public.create_api_token('Past', 'read',
       now() - interval '1 day') $q$,
  '22023', null, 'a past expiry is rejected');
select throws_ok(
  $q$ select * from public.create_api_token('Long', 'read',
       now() + interval '400 days') $q$,
  '22023', null, 'an expiry beyond one year is rejected');

create temp table laptop_token as
select * from public.create_api_token('Laptop', 'write', now() + interval '90 days');
select is((select count(*) from laptop_token), 1::bigint,
  'the owner can create a write token');
select is(
  (select t.scope from public.api_tokens t
    join laptop_token l on l.id = t.id),
  'write', 'the write token stores its scope');

-- The second account cannot revoke another account's token.
set local "request.jwt.claims" =
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"partner@api.test"}';
select is(
  (select public.revoke_api_token((select id from laptop_token))),
  false, 'the partner cannot revoke another account token');
select is(
  (select revoked_at from public.api_tokens
    where id = (select id from laptop_token)),
  null::timestamptz, 'the token stays active after the refused revoke');

-- Read-token authentication.
set local "request.jwt.claims" =
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"owner@api.test"}';
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_token))::text, true);

select is(
  (select owner_id from public.api_authenticate('read')),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'a read token authenticates its owner');
select is(
  (select last_used_at is not null from public.api_tokens
    where id = (select id from owner_token)),
  true, 'authentication records last_used_at');
select is(
  (select calls from public.api_usage
    where token_id = (select id from owner_token) and day = current_date),
  1, 'authentication counts the call');
select is(
  (select token_id from public.api_authenticate('read')),
  (select id from owner_token), 'authentication returns the token id');
select is(
  (select calls from public.api_usage
    where token_id = (select id from owner_token) and day = current_date),
  2, 'a second call increments the daily counter');

select throws_ok(
  $q$ select * from public.api_authenticate('write') $q$,
  '42501', null, 'a read token cannot request write scope');

set local "request.headers" = '{}';
select throws_ok(
  $q$ select * from public.api_authenticate('read') $q$,
  '42501', null, 'a missing token is rejected');
set local "request.headers" =
  '{"x-folio-token":"folio_pat_deadbeef"}';
select throws_ok(
  $q$ select * from public.api_authenticate('read') $q$,
  '42501', null, 'an invalid token is rejected');

-- Expired, revoked, and capped tokens. Direct inserts bypass the creator RPC;
-- api_authenticate is the gate under test.
insert into public.api_tokens
  (owner_id, name, token_hash, prefix, scope, expires_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Expired',
   encode(extensions.digest('folio_pat_expired', 'sha256'), 'hex'),
   left('folio_pat_expired', 16), 'read', now() - interval '1 day'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Revoked',
   encode(extensions.digest('folio_pat_revoked', 'sha256'), 'hex'),
   left('folio_pat_revoked', 16), 'read', now() + interval '30 days'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Capped',
   encode(extensions.digest('folio_pat_capped', 'sha256'), 'hex'),
   left('folio_pat_capped', 16), 'read', now() + interval '30 days');
update public.api_tokens set revoked_at = now() where name = 'Revoked';
insert into public.api_usage (token_id, day, calls)
select id, current_date, 5000 from public.api_tokens where name = 'Capped';

set local "request.headers" =
  '{"x-folio-token":"folio_pat_expired"}';
select throws_ok(
  $q$ select * from public.api_authenticate('read') $q$,
  '42501', null, 'an expired token is rejected');
set local "request.headers" =
  '{"x-folio-token":"folio_pat_revoked"}';
select throws_ok(
  $q$ select * from public.api_authenticate('read') $q$,
  '42501', null, 'a revoked token is rejected');
set local "request.headers" =
  '{"x-folio-token":"folio_pat_capped"}';
select throws_ok(
  $q$ select * from public.api_authenticate('read') $q$,
  '53400', null, 'the daily call cap is enforced');

-- The write token can request write scope.
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from laptop_token))::text, true);
select is(
  (select scope from public.api_authenticate('write')),
  'write', 'a write token can request write scope');

-- Revocation and the revoked-token path.
select set_config('request.headers', jsonb_build_object(
  'x-folio-token', (select token from owner_token))::text, true);
select is(
  (select public.revoke_api_token((select id from owner_token))),
  true, 'the owner can revoke a token');
select is(
  (select revoked_at is not null from public.api_tokens
    where id = (select id from owner_token)),
  true, 'revocation is recorded');
select is(
  (select public.revoke_api_token((select id from owner_token))),
  false, 'a second revoke is a no-op');
select throws_ok(
  $q$ select * from public.api_authenticate('read') $q$,
  '42501', null, 'a revoked token cannot authenticate');

-- Grants follow the 0014 convention: explicit, least privilege.
select is(
  (select has_function_privilege('authenticated',
     'public.can_manage_api_tokens()', 'execute')),
  true, 'authenticated can call can_manage_api_tokens');
select is(
  (select has_function_privilege('anon',
     'public.can_manage_api_tokens()', 'execute')),
  false, 'anon cannot call can_manage_api_tokens');
select is(
  (select has_function_privilege('authenticated',
     'public.create_api_token(text,text,timestamptz)', 'execute')),
  true, 'authenticated can call create_api_token');
select is(
  (select has_function_privilege('anon',
     'public.create_api_token(text,text,timestamptz)', 'execute')),
  false, 'anon cannot call create_api_token');
select is(
  (select has_function_privilege('authenticated',
     'public.list_api_tokens()', 'execute')),
  true, 'authenticated can call list_api_tokens');
select is(
  (select has_function_privilege('anon',
     'public.list_api_tokens()', 'execute')),
  false, 'anon cannot call list_api_tokens');
select is(
  (select has_function_privilege('authenticated',
     'public.revoke_api_token(uuid)', 'execute')),
  true, 'authenticated can call revoke_api_token');
select is(
  (select has_function_privilege('anon',
     'public.revoke_api_token(uuid)', 'execute')),
  false, 'anon cannot call revoke_api_token');
select is(
  (select has_function_privilege('authenticated',
     'public.api_authenticate(text)', 'execute')),
  false, 'api_authenticate stays internal');
select is(
  (select has_function_privilege('anon',
     'public.api_authenticate(text)', 'execute')),
  false, 'anon cannot call api_authenticate');

select is(
  (select has_table_privilege('anon', 'public.api_tokens', 'select')),
  false, 'anon cannot read the token table');
select is(
  (select has_table_privilege('authenticated', 'public.api_tokens', 'select')),
  false, 'authenticated cannot read the token table directly');
select is(
  (select has_table_privilege('authenticated', 'public.api_usage', 'select')),
  false, 'authenticated cannot read the usage table directly');
select is(
  (select has_table_privilege('authenticated', 'public.api_audit', 'select')),
  false, 'authenticated cannot read the audit table directly');
select is((select count(*) from public.api_audit), 0::bigint,
  'the audit table starts empty');

select * from finish();
rollback;
