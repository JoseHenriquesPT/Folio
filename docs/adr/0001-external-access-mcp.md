# ADR-0001: External access via scoped tokens and a local MCP server

**Status:** Accepted (amended 2026-11-25: per-account tokens)
**Date:** 2026-11-12
**Deciders:** Owner, implementation session

## Context

Folio is a private notes app for one owner and their partner. The owner wants an
external AI harness — VS Code Copilot first, any MCP client later — to read and
manipulate notes and notebooks. The constraints agreed before this decision:

- **Model-agnostic.** Folio must not embed a provider SDK, a provider key, or a
  prompt. The external client chooses the model.
- **No or minimal dependencies per device.** No new hosted service, no Docker,
  no Supabase CLI, and ideally no `npm install` on the machine that runs the
  harness.
- **Works from different devices against the same account.** The database stays
  the source of truth; there is no device-to-device sync.
- **Only the account's visible notes.** A token may see what its account can
  see: notes it owns plus notes shared with it (note or notebook shares). It
  must never see another account's unshared data.
- **Safe writes.** No silent overwrites, no destructive operations, a full
  audit trail, and undo for content changes.
- **The database remains the authority.** Guardrail 9 applies to every external
  path; no client gets a service-role key.
- **Folio does not send note content anywhere.** Note data leaves Supabase only
  when the external client calls a tool; that client decides what reaches its
  model.

An in-app assistant with a hosted LLM gateway was considered first. It was
rejected for this phase because it adds provider coupling, per-token cost, and
a new outbound data flow, while failing the primary requirement: the chat lives
in the external harness.

## Decision

Build a **database-enforced tool API** and a **local stdio MCP adapter**.

```text
VS Code Copilot (or any MCP client)
  ⇅ stdio (MCP)
Local folio-mcp server  ── HTTPS + PAT ──▶  PostgREST `api_*` RPCs
                                              └─ ownership/share checks, audit, usage
```

1. **Personal access tokens.** `api_tokens` stores a SHA-256 hash only. A token
   is `folio_pat_` plus 32 random bytes, has a display prefix, a `read` or
   `write` scope, an expiry (default 90 days), `last_used_at`, and a revoke
   timestamp. The raw token is shown once. Tokens are created, listed, and
   revoked through security-definer RPCs; the table is not directly readable
   through the API.
2. **Per-account token creation.** Every signed-in account can create, list and
   revoke its own tokens through RPCs that filter on `auth.uid()`. No account
   can see or revoke another account's tokens. Originally the earliest profile
   was the only account allowed to manage tokens via `profiles.is_owner`;
   amended 2026-11-25 and the flag removed.
3. **Account-wide visibility.** A token resolves to its owner inside the
   database. No tool accepts an `owner_id`, email, or account argument. Every
   query filters explicitly with the existing `owns_note` /
   `can_read_note` / `can_edit_note` / `owns_notebook` helpers, so a token sees
   exactly what the app would show that account, including notes shared with
   it.
4. **A local stdio MCP server.** `mcp/` is a Node/TypeScript adapter that
   exposes the RPCs as MCP tools. It is launched by the client, keeps the token
   in a host environment variable, and stores no notes. The tool contract is
   transport-agnostic; a remote HTTP transport can be added later without
   changing the RPCs. The current VS Code Copilot harness reads the native
   `mcpServers` format from workspace-root `.mcp.json` or
   `~/.copilot/mcp-config.json`; the deprecated editor-managed
   `.vscode/mcp.json` + `inputs` format is not used.
5. **Read and write tools with a deliberately small blast radius.** Read tools:
   `search_notes`, `get_note`, `list_notes`, `list_notebooks`, `list_tags`,
   `get_vault_overview`. Write tools: `create_note`, `update_note`,
   `move_notes`, `add_tags`, `remove_tags`, `create_notebook`,
   `rename_notebook`. Excluded in v1: sharing and re-sharing, trash and
   permanent delete, empty trash, attachment deletion, pin/archive, and any
   account or permission change.
6. **Write safety.** Content updates use the version-checked save path and
   reject stale versions. Structural changes are owner-only. Input Markdown is
   converted to HTML and sanitized with the editor's allowlist before storage;
   reads convert stored HTML to Markdown. Every call is audited (token, tool,
   note ids, status, time; never note bodies in logs). Content updates keep a
   before-snapshot and can be undone while the note has not changed since.
7. **No new hosting.** No Edge Function, no LLM provider key, no Vercel
   environment change, and no CSP change. The only deployment is database
   migrations plus the Settings UI.
8. **Per-device tokens.** The owner is encouraged to create one token per
   device ("Desktop", "Laptop"), so a lost device can be revoked without
   affecting the others.

### Security invariants

- `api_authenticate(required_scope)` reads the `x-folio-token` header, hashes
  the token, validates owner, scope, expiry, and revocation, updates
  `last_used_at` and the daily usage counter, and returns the owner. Its
  EXECUTE is revoked from `public`, `anon`, and `authenticated`; only the tool
  RPCs (running as the definer) call it.
- The tool RPCs are `SECURITY DEFINER` with a fixed `search_path`. They set the
  request claims to the token owner and filter explicitly; they must not rely
  on RLS inside the function, because the definer bypasses it. `anon` EXECUTE
  on the tool RPCs is intentional: the token is the credential, and every RPC
  validates it. pgTAP must prove missing, invalid, expired, revoked, and
  wrong-scope tokens fail on every tool.
- No service role exists in the MCP server or the browser. A guard test scans
  `mcp/` and `supabase/functions/` for `service_role` / `SERVICE_ROLE`.
- Tokens are never logged, committed, placed in Vercel environment variables,
  or pasted into prompts. The Copilot harness does not support `${input:...}`
  prompts or VS Code SecretStorage for MCP configuration; the token is supplied
  through a `${FOLIO_TOKEN}` environment reference, so the configuration file
  contains only the reference and the value lives in the host environment.
- The tool RPCs are the only public surface; table and column access stays
  closed. `api_audit` is owner-readable only.
- Prompt injection is an accepted residual risk: note content is untrusted
  input to the external model. Mitigations are a read-only token by default,
  explicit write tokens, no destructive tools, version checks, audit/undo, a
  daily call cap, and the client's own tool-approval setting.

### Verified VS Code environment (2026-11-12)

- Installed editor: VS Code 1.143.0 (Windows, x64).
- Current Copilot documentation (updated 2026-11-11) says the Copilot harness
  reads the portable `mcpServers` format from workspace-root `.mcp.json` or
  `$COPILOT_HOME/mcp-config.json` (`~/.copilot/mcp-config.json` when unset).
  `.vscode/mcp.json` and profile `mcp.json` with `servers`/`inputs` belong to
  the deprecated Local harness (removal February 2027); eligible definitions can
  be forwarded, but `${input:...}` and `${command:...}` configurations are
  rejected.
- The Copilot harness supports `${NAME}` environment references in `env`,
  `command`, and `args`; it does not support `envFile`, input prompting, or a
  SecretStorage bridge. The token therefore lives in the host environment, not
  in the configuration file.
- The GitHub Copilot extension was not listed by `code --list-extensions` on
  this machine at 8.0. The owner-side acceptance run must enable Copilot (or
  run on the machine where it is installed) before 8.2 can be signed off.

## Options Considered

### Option A: In-app assistant with a hosted LLM gateway

A chat panel in Folio, an Edge Function holding provider credentials, and
server-side tool execution.

| Dimension | Assessment |
| --- | --- |
| Complexity | High — new backend, provider adapter, prompt/context management |
| Cost | Per-token provider cost plus function invocations |
| Scalability | Fine for two users, but a second data processor |
| Team familiarity | Supabase Edge Functions are new to this codebase |

**Pros:** Integrated UX; Folio controls the tool loop; streaming in the app.

**Cons:** Provider coupling and keys; note content leaves through Folio's
server; the owner explicitly wants the chat externally; larger surface to
secure; in-app confirmation cannot be reused by external clients.

### Option B: Remote HTTP MCP endpoint in a Supabase Edge Function

VS Code connects to `https://<ref>.supabase.co/functions/v1/mcp` with a PAT
header.

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium — public function, MCP HTTP transport, rate limits |
| Cost | Function invocations; no local runtime |
| Scalability | Works from any device; long-lived sessions need care |
| Team familiarity | New Deno runtime and deployment path |

**Pros:** No local install; same endpoint from every device; central updates.

**Cons:** A public endpoint with its own token validation; `verify_jwt` must be
disabled for PAT clients; more deployment and monitoring; the free-tier
function limits are unproven for this use. Deferred to Phase 8.5 unless the
owner needs clients that cannot run a local server.

### Option C: Local stdio MCP server + PAT + security-definer RPCs (chosen)

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium — SQL tool surface plus a small Node adapter |
| Cost | None beyond the existing Supabase plan |
| Scalability | Per-device process; no shared session state |
| Team familiarity | Node/TypeScript and pgTAP are already used |

**Pros:** No new hosting or public endpoint; the token stays on the device; the
same RPCs work from `curl` or a future in-app assistant; model-agnostic; the
database remains the sole permission system; a single bundled file avoids
runtime `npm install`.

**Cons:** Node is required on each device (or a compiled binary later); the MCP
client must support stdio (VS Code Copilot does); distribution is manual for
v1.

### Option D: Local mirror with sync

Export the vault to local files, let the harness edit files, then sync back.

**Pros:** Agents that only understand files work naturally; offline reads.

**Cons:** Creates a second source of truth, conflict resolution, deletion
tracking, attachment handling, and a much larger feature. Contradicts
guardrail 3. Rejected.

### Option E: Approval queue for writes

Every external write becomes a pending change reviewed in Folio before it is
applied.

**Pros:** A true human gate; strongest protection against prompt injection.

**Cons:** The agent must wait for a human, which breaks the "easily manipulate"
flow; adds a proposals table and a new review UI. Not chosen for v1. The tool
contract allows it to be added later without changing clients.

## Trade-off Analysis

- **Local vs remote transport.** Local wins on dependencies and exposure; it
  loses on install effort and phone/web clients. The RPCs are transport-neutral,
  so the remote option is additive.
- **PAT vs OAuth.** A PAT is simple, revocable, and fits the local adapter (and
  an HTTP header for a future remote transport). OAuth is the MCP-standard path
  for remote servers and can be added with the remote transport.
- **Explicit RPCs vs direct PostgREST table access.** RPCs keep authorization
  in one reviewed place and hide table/column shape. The cost is more SQL and a
  larger pgTAP matrix.
- **Audit/undo vs approval queue.** Direct writes preserve flow; audit/undo is
  recovery, not prevention. The owner chose this trade-off knowingly. The
  approval queue remains a later option.
- **Account-wide vs owned-only.** Account-wide matches the app's visibility and
  was chosen explicitly. A token-level `owned_only` flag can narrow it later
  without changing the tool contract.
- **Bundled single file vs `npx` package.** A single bundled file built once and
  copied avoids a registry dependency and network installs on each device. A
  published package is a later convenience.

## Consequences

- **Easier:** model-agnostic external access; no provider lock-in; no new
  hosting; multi-device use against the same account; reversible writes; the
  same tool layer can power an in-app assistant later.
- **Harder:** a new SQL authorization surface that needs exhaustive pgTAP; a
  token lifecycle UI; MCP client configuration per device; Node distribution.
- **Revisit:** remote HTTP transport and OAuth (8.5), approval queue (8.5),
  per-notebook or owned-only token scope (8.5), pin/archive tools (8.5),
  attachment access and signed URLs (8.5), semantic search (8.5).
- **Unchanged:** the web app's permissions, sharing model, export/restore, and
  offline behavior. The MCP server is not part of the Vercel bundle.

## Amendment — 2026-11-25

The single-owner gate in decision 2 was removed. Every signed-in account now
manages its own tokens; the management RPCs filter on `auth.uid()`, and
`profiles.is_owner` plus its first-profile trigger were dropped in
`0021_api_tokens_all_accounts.sql`. Account isolation is unchanged and is
covered by pgTAP: one account cannot see, revoke or undo another account's
tokens, audit rows or unshared notes. The owner chose self-service per account
over a central admin model.

## Action Items

1. [x] **8.1 Token foundation** — migration `0016_api_tokens.sql`, management
   RPCs, `api_authenticate`, audit/usage tables, Settings → External access.
   Failing pgTAP first: hashing, per-account creation and isolation, expiry,
   revoke, scope, no direct table access. Done 2026-11-12; see Phase 8 progress
   in `docs/PLAN.md`.
2. [x] **8.2 Read interface** — read tool RPCs, the local MCP server with the
   official SDK, the single-file build, MCP Inspector smoke test, and a
   read-only Copilot session against the real vault. Done 2026-11-12; the
   stdio smoke passed against local Supabase and the Copilot session remains
   owner-side. See `docs/PLAN.md` Phase 8 progress.
3. [x] **8.3 Write interface** — write tool RPCs, Markdown sanitization,
   version checks, batch results, audit with before-snapshots, and the full
   owner/editor/reader/stranger matrix. Done 2026-11-15. Dry-run is covered by
   reading before writing (`get_note` + `expected_version`) and the audit
   snapshots; the undo viewer lands in 8.4.
4. [x] **8.4 Safety and polish** — audit viewer and undo, daily caps,
   per-device token names, bundled server and setup docs, VS Code acceptance,
   deploy the database then the frontend. Done 2026-11-16.
5. [ ] **8.5 Optional** — remote HTTP transport, OAuth, approval queue,
   per-notebook token scope, pin/archive, attachment access, semantic search.
