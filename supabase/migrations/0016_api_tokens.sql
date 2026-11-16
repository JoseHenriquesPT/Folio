-- External access tokens (Phase 8.1).
--
-- Personal access tokens are owner-created, hashed at rest, scoped read/write,
-- expiring, revocable, and account-wide. They are the credential for the
-- `api_*` tool RPCs (8.2/8.3): every tool validates the token header, resolves
-- the owning profile, and then applies the same ownership/share rules as the
-- app. No client receives a service-role key.
--
-- Grants are explicit per the 0014 convention: hosted has no default ACLs, so
-- every function and table gets a revoke and, where an API role needs it, an
-- explicit grant. The token, usage and audit tables are never readable through
-- the API; management goes through security-definer RPCs.
--
-- The per-token daily call cap is 5,000 calls (api_authenticate).

-- ---------------------------------------------------------------------------
-- Owner flag. The first profile becomes the owner; the migration marks the
-- earliest existing profile so hosted keeps working. The flag is not exposed by
-- the profiles column grants (id, display_name only).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column is_owner boolean not null default false;

create function public.assign_first_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize concurrent sign-ups so only one can become the first owner.
  perform pg_catalog.pg_advisory_xact_lock(920001);

  if not exists (select 1 from public.profiles p where p.is_owner) then
    new.is_owner := true;
  end if;

  return new;
end;
$$;

create trigger profiles_assign_first_owner
before insert on public.profiles
for each row execute function public.assign_first_owner();

update public.profiles
   set is_owner = true
 where id = (
   select p.id
   from public.profiles p
   order by p.created_at asc, p.id asc
   limit 1
 );

create unique index profiles_one_owner_idx
  on public.profiles (is_owner)
  where is_owner;

revoke all on function public.assign_first_owner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Token, usage and audit tables.
-- ---------------------------------------------------------------------------

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  prefix text not null,
  scope text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint api_tokens_name_length
    check (char_length(name) between 1 and 80),
  constraint api_tokens_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint api_tokens_prefix_length
    check (char_length(prefix) = 16),
  constraint api_tokens_scope
    check (scope in ('read', 'write'))
);

create index api_tokens_owner_idx on public.api_tokens (owner_id);

comment on table public.api_tokens is
  'Owner-created external access tokens. Only the SHA-256 hash is stored.';

create table public.api_usage (
  token_id uuid not null references public.api_tokens (id) on delete cascade,
  day date not null default current_date,
  calls integer not null default 0,
  primary key (token_id, day),
  constraint api_usage_calls_nonnegative check (calls >= 0)
);

comment on table public.api_usage is
  'Daily call counters per token; enforced by api_authenticate.';

create table public.api_audit (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  token_id uuid references public.api_tokens (id) on delete set null,
  tool text not null,
  status text not null,
  note_ids uuid[] not null default '{}',
  summary jsonb not null default '{}'::jsonb,
  before_snapshot jsonb,
  created_at timestamptz not null default now(),
  constraint api_audit_status check (status in ('ok', 'error'))
);

create index api_audit_owner_created_idx
  on public.api_audit (owner_id, created_at desc);

comment on table public.api_audit is
  'Metadata for external tool calls. Note bodies never go in logs; before_snapshot is only used for undo.';

alter table public.api_tokens enable row level security;
alter table public.api_usage enable row level security;
alter table public.api_audit enable row level security;

-- No direct API access: management and tools go through security-definer RPCs.
revoke all on public.api_tokens from anon, authenticated;
revoke all on public.api_usage from anon, authenticated;
revoke all on public.api_audit from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Management RPCs. Authenticated-only, owner-gated, and never accepting an
-- owner id from the caller.
-- ---------------------------------------------------------------------------

create function public.can_manage_api_tokens()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_owner from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

create function public.create_api_token(
  p_name text,
  p_scope text,
  p_expires_at timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  token text,
  prefix text,
  scope text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_token text;
  v_hash text;
  v_prefix text;
  v_id uuid;
begin
  if v_owner is null
     or not exists (
       select 1 from public.profiles p
       where p.id = v_owner and p.is_owner
     ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_name) < 1
     or pg_catalog.char_length(v_name) > 80 then
    raise exception 'name must be between 1 and 80 characters'
      using errcode = '22023';
  end if;

  if p_scope is null or p_scope not in ('read', 'write') then
    raise exception 'scope must be read or write' using errcode = '22023';
  end if;

  if p_expires_at is null
     or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '365 days' then
    raise exception 'expiry must be in the next 365 days'
      using errcode = '22023';
  end if;

  v_token := 'folio_pat_' ||
    pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_prefix := pg_catalog.left(v_token, 16);

  insert into public.api_tokens
    (owner_id, name, token_hash, prefix, scope, expires_at)
  values
    (v_owner, v_name, v_hash, v_prefix, p_scope, p_expires_at)
  returning public.api_tokens.id into v_id;

  return query
  select v_id, v_token, v_prefix, p_scope, p_expires_at;
end;
$$;

create function public.list_api_tokens()
returns table (
  id uuid,
  name text,
  prefix text,
  scope text,
  created_at timestamptz,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  calls_today integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_owner
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.name,
    t.prefix,
    t.scope,
    t.created_at,
    t.last_used_at,
    t.expires_at,
    t.revoked_at,
    coalesce((
      select u.calls
      from public.api_usage u
      where u.token_id = t.id and u.day = current_date
    ), 0)::integer
  from public.api_tokens t
  where t.owner_id = (select auth.uid())
  order by t.created_at desc;
end;
$$;

create function public.revoke_api_token(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_owner
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.api_tokens
     set revoked_at = pg_catalog.now()
   where id = p_id
     and owner_id = (select auth.uid())
     and revoked_at is null;

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- The token gate. The tool RPCs (8.2/8.3) call this first; API roles never get
-- EXECUTE. It reads the token from the request header, checks the hash,
-- scope, expiry and revocation, records usage, and returns the account.
-- ---------------------------------------------------------------------------

create function public.api_authenticate(p_required_scope text)
returns table (
  owner_id uuid,
  token_id uuid,
  scope text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers text;
  v_token text;
  v_hash text;
  v_row public.api_tokens%rowtype;
  v_calls integer;
  v_daily_limit constant integer := 5000;
begin
  if p_required_scope is null or p_required_scope not in ('read', 'write') then
    raise exception 'scope must be read or write' using errcode = '22023';
  end if;

  begin
    v_headers := pg_catalog.current_setting('request.headers', true);
    if v_headers is not null and v_headers <> '' then
      v_token := (v_headers::jsonb) ->> 'x-folio-token';
    end if;
  exception when invalid_text_representation then
    v_token := null;
  end;

  if v_token is null or pg_catalog.btrim(v_token) = '' then
    raise exception 'invalid token' using errcode = '42501';
  end if;

  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.btrim(v_token), 'sha256'),
    'hex'
  );

  select * into v_row
  from public.api_tokens t
  where t.token_hash = v_hash;

  if not found
     or v_row.revoked_at is not null
     or v_row.expires_at <= pg_catalog.now() then
    raise exception 'invalid token' using errcode = '42501';
  end if;

  if p_required_scope = 'write' and v_row.scope <> 'write' then
    raise exception 'invalid token' using errcode = '42501';
  end if;

  update public.api_tokens
     set last_used_at = pg_catalog.now()
   where id = v_row.id;

  insert into public.api_usage (token_id, day, calls)
  values (v_row.id, current_date, 1)
  on conflict on constraint api_usage_pkey do update
    set calls = public.api_usage.calls + 1
  returning calls into v_calls;

  if v_calls > v_daily_limit then
    raise exception 'daily call limit reached' using errcode = '53400';
  end if;

  return query select v_row.owner_id, v_row.id, v_row.scope;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: management is callable by authenticated users (the function itself
-- gates on is_owner); anon is always refused. The gate stays internal.
-- ---------------------------------------------------------------------------

revoke all on function public.can_manage_api_tokens() from public, anon;
grant execute on function public.can_manage_api_tokens() to authenticated;

revoke all on function public.create_api_token(text, text, timestamptz)
  from public, anon;
grant execute on function public.create_api_token(text, text, timestamptz)
  to authenticated;

revoke all on function public.list_api_tokens() from public, anon;
grant execute on function public.list_api_tokens() to authenticated;

revoke all on function public.revoke_api_token(uuid) from public, anon;
grant execute on function public.revoke_api_token(uuid) to authenticated;

revoke all on function public.api_authenticate(text)
  from public, anon, authenticated;
