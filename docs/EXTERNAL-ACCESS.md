# External access (MCP)

Folio can expose your notes and notebooks to an external MCP client such as VS
Code Copilot. The client runs on your machine; Folio does not call an AI
provider and does not hold a model key. The local server fetches notes on
demand and hands them to the client, which decides what reaches its model.

The interface is deliberately small: scoped personal access tokens, a local
stdio server, database-enforced permissions, and an audit trail with undo.

## How it fits together

```text
VS Code Copilot (or another MCP client)
  ⇅ stdio
Local folio-mcp server  ── HTTPS + token ──▶  Postgres tool RPCs
                                                └─ ownership/share checks, audit
```

- **Read tokens** can search and read notes.
- **Write tokens** can also create notes, edit title/body, move notes, add or
  remove tags, and create or rename notebooks.
- Nothing can share, trash, permanently delete, empty the trash, delete
  attachments, pin or archive. Those stay in the app UI.

A token resolves to its account inside the database. It sees exactly what that
account can see: notes it owns plus notes shared with it. No tool accepts an
owner id, so one account cannot ask for another account's data.

External access is **per account**. Every signed-in account can open Settings →
External access and manage its own tokens. A token sees exactly what that
account sees: notes it owns plus notes and notebooks shared with it. No account
can see or revoke another account's tokens, audit rows, or unshared notes; no
tool accepts an account id. If your content lives across two accounts, each
account can create its own token, or share the notebooks with the account whose
token you use.

## Security model

- Tokens are created by the account that uses them, shown once, and stored as
  SHA-256 hashes. They are `read` or `write`, expire, and can be revoked
  immediately.
- Each token has a daily cap of 5,000 calls.
- The local server uses the public publishable key plus the token header. It
  never receives a service-role key.
- Every successful write is recorded in the audit log. Updates keep the
  previous title/body/version so they can be undone while the note has not
  changed.
- Note content is untrusted input to an external model. Use a **read** token
  for questions and summaries; create a **write** token only when you are
  actively directing changes. Keep your MCP client's tool approval on.
- The external client's model terms apply once the note leaves Folio. Folio
  itself does not send note content anywhere.

## Create a token

Settings → External access → New token.

1. Give it a device name: `Desktop`, `Laptop`, `Work PC`.
2. Choose **Read only** or **Read and write**.
3. Choose 30 days, 90 days or 1 year.
4. Copy the token when it appears. It is not shown again.

Create a separate token for each device so a lost device can be revoked on its
own. The token list shows the prefix, scope, status, last use, calls today and
expiry. Revoke is immediate.

## Build the server

```text
npm run build:mcp
```

This produces `mcp/dist/folio-mcp.cjs` — one self-contained file. Copy that
one file to each device. There is no `npm install` on the device, but it needs
**Node.js 20 or newer**. The file is gitignored in the Folio repository.

The app build does not include the server, and the server is not deployed.

## Set up a device

Do this once per device. The token is per device; the server and the client
config are ordinary files.

### 1. Node and the server

Install **Node.js 20 or newer**, then put the server file on the device:

- Run `npm run build:mcp` in a checkout of this repository, or copy
  `mcp/dist/folio-mcp.cjs` from another machine, and keep it somewhere stable
  such as `%USERPROFILE%\.folio\folio-mcp.cjs`.
- The file is self-contained: no `npm install`, no `node_modules`, no build
  step on the target device. It is gitignored in this repository and is not
  part of the web deploy.

### 2. Create the token for that device

Settings → External access → New token. Name it after the device (`Laptop`,
`Work PC`). Choose **Read only** for everyday questions, **Read and write** only
if you want the client to change notes. Prefer 30 or 90 days on a machine you do
not fully control. Copy the token once — it is not shown again.

### 3. Put the token in the environment

The client config holds a reference, not the token.

| Place | Works | Notes |
| --- | --- | --- |
| User environment variable | Yes | Recommended; readable by any program running as your user |
| `~/.copilot/mcp-config.json` literal value | Yes | A secret in a file; keep it out of repositories |
| Workspace `.mcp.json` literal value | Yes | Avoid: the file lives in a repository |
| `.env.local` | **No** | The MCP server does not read env files; that file is for Vite |
| OS credential store | Via a launcher | Strictest; see below |

Windows (PowerShell):

```powershell
setx FOLIO_TOKEN "folio_pat_..."
```

Then **fully quit every VS Code window and reopen** — VS Code inherits its
environment at launch, so a window reload is not enough. `setx` writes the user
environment; new terminals see it too. The command lands in your PowerShell
history, so use the GUI (`Win+R` → `sysdm.cpl` → Environment Variables) if that
matters.

macOS / Linux:

```bash
export FOLIO_TOKEN="folio_pat_..."   # add to ~/.zshrc or ~/.bashrc
```

GUI-launched apps on macOS do not read shell profiles: start VS Code from a
terminal (`code .`) or use `launchctl setenv FOLIO_TOKEN "folio_pat_..."`.

Check it without printing the value — a Folio token is 74 characters:

```powershell
$env:FOLIO_TOKEN.Length
```

```bash
printf %s "$FOLIO_TOKEN" | wc -c
```

### 4. Point the client at the server

VS Code 1.143 reads the native `mcpServers` format. Use the **global** file
`~/.copilot/mcp-config.json` to make Folio available in every workspace on that
device, or a workspace-root `.mcp.json` for this repository only.

```json
{
  "mcpServers": {
    "folio": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/you/.folio/folio-mcp.cjs"],
      "env": {
        "FOLIO_SUPABASE_URL": "https://<project-ref>.supabase.co",
        "FOLIO_SUPABASE_ANON_KEY": "<publishable-key>",
        "FOLIO_TOKEN": "${FOLIO_TOKEN}"
      }
    }
  }
}
```

- `FOLIO_SUPABASE_URL` and `FOLIO_SUPABASE_ANON_KEY` are the project URL and the
  publishable/anon key. Both are public — they ship in the web bundle.
- `FOLIO_TOKEN` is a **reference**. Copilot expands `${FOLIO_TOKEN}` from the
  environment of the process that runs the server. That is the native Copilot
  syntax. `${env:FOLIO_TOKEN}` belongs to the deprecated `.vscode/mcp.json`
  format and is not read here.
- The repository's workspace-root `.mcp.json` is machine-specific (absolute
  server path) and gitignored. Create it per device from this template; use the
  global file if you would rather configure once per machine.

### 5. Restart and verify

Quit VS Code fully, reopen it, and use Copilot Chat in **Agent** mode. Ask it to
list notebooks or search a note — for example *"Use the folio tools to list my
notebooks."* The tools are namespaced by the client (`search_notes`, `get_note`,
`create_note`, …).

Then check Settings → External access: **last used** moves and **calls today**
increases. Reads do not create audit entries; writes appear under **Recent
external changes**.

If the server does not start, confirm Node is 20+, the `.cjs` path is absolute
and correct, and `FOLIO_TOKEN` holds the token itself — not the literal text
`${FOLIO_TOKEN}`.

### Who can read the token

A user environment variable is readable by **any program running as your
user**: other MCP servers, Copilot agents, IDE extensions, scripts, and anything
you start from a terminal. That is the trade-off for convenience.

If that matters to you:

- Keep a **read** token in the global environment and use a write token only for
  deliberate sessions (set it in the terminal that launches VS Code, not
  globally).
- Use a separate token per device with a 30- or 90-day expiry.
- Revoke a device's token the moment it is lost; revocation is immediate.
- Strictest option: leave the environment alone and use a small launcher that
  reads the token from your password manager or the OS credential store, then
  starts VS Code with `FOLIO_TOKEN` set only in that process. The client config
  does not change.

## Tools

### Read

| Tool | What it does |
| --- | --- |
| `search_notes` | Full-text search over title/body, optional notebook and tag filters, archived notes opt-in |
| `get_note` | One note as Markdown plus metadata, tags and attachment names; `max_chars` bounds long notes |
| `list_notes` | Paginated note list, newest first, optional notebook/tag filters |
| `list_notebooks` | The visible notebook tree with parent ids, note counts and shared-owner names |
| `list_tags` | Your tags with note counts |
| `get_vault_overview` | Counts for active/archived/trashed owned notes, shared-with-me notes, notebooks, tags and attachments |

### Write (write-scoped token)

| Tool | What it does |
| --- | --- |
| `create_note` | Create a note in an owned notebook (or Unfiled), with tags |
| `update_note` | Replace, append or prepend a Markdown body and/or change the title; requires `expected_version` |
| `move_notes` | Move owned notes to an owned notebook, or to Unfiled |
| `add_tags` / `remove_tags` | Add/remove tags on owned notes; names are case-insensitive |
| `create_notebook` | Create a notebook under an owned parent or at the root |
| `rename_notebook` | Rename an owned notebook |

Markdown is converted to the editor's HTML and sanitized with the same
allowlist the editor uses. Task lists, tables, links and attachment image
references are preserved.

## Writing safely

1. Read the note with `get_note`; keep its `version`.
2. Call `update_note` with that `expected_version` and the new body.
3. If someone saved in the meantime, the call fails with a conflict. Re-read
   the note and retry; the old version is never overwritten.

`append` and `prepend` re-read the current note and then apply the version
check, so you can add to a note without rebuilding the whole body. The tool
never silently ignores a conflict.

## Audit and undo

Settings → External access → **Recent external changes** lists the latest
calls with the tool, note title, token and time. An update row offers **Undo**
while the note still matches the version the update produced. Undo restores the
previous title/body as a new version and is itself audited. If the note changed
after the external update, Undo is unavailable; the app will not overwrite the
newer work.

The audit never exposes note bodies in the list. The stored before-snapshot is
kept only for undo.

## Limits

- 5,000 calls per token per day.
- Note bodies are bounded to 1,000,000 characters and titles to 500.
- Batches are capped at 100 notes/notebooks and 20 tags per call.
- Attachments are metadata only; the server does not download or upload bytes.
- Long notes can be truncated in `get_note` with `max_chars`.

## Local development

Use the same process against the local Supabase stack:

```text
npx supabase start
npm run build:mcp
```

Create a token in the local app's Settings → External access and point the
client at a separate server entry with its **own** environment reference, so a
hosted token can never be sent to the local stack:

```json
{
  "mcpServers": {
    "folio-local": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/Folio/mcp/dist/folio-mcp.cjs"],
      "env": {
        "FOLIO_SUPABASE_URL": "http://127.0.0.1:54321",
        "FOLIO_SUPABASE_ANON_KEY": "<local publishable key>",
        "FOLIO_TOKEN": "${FOLIO_LOCAL_TOKEN}"
      }
    }
  }
}
```

Set `FOLIO_LOCAL_TOKEN` to the local token. The local publishable key is in
`npx supabase status`. Local tokens live in the local database only: a
`npx supabase db reset` deletes them, so create a new one after a reset. The
`.env.local` file is read by Vite, not by the MCP server.

## Troubleshooting

| Message | Meaning |
| --- | --- |
| `The Folio token is invalid, expired, revoked, or lacks the required scope.` | Create a new token, check read vs write, or revoke/recreate |
| `The note changed since it was read...` | Re-run `get_note` and use the current `version` |
| `The note is in the trash and cannot be changed.` | Restore it in the app first |
| `This token has reached its daily call limit.` | Wait for the next day or use another token |
| The server does not start | Check `FOLIO_SUPABASE_URL`, `FOLIO_SUPABASE_ANON_KEY`, `FOLIO_TOKEN`, Node 20+, and the `.cjs` path |
| `FOLIO_TOKEN is missing` or the token is literally `${FOLIO_TOKEN}` | VS Code was launched without the variable: set it, then fully quit and reopen VS Code (a window reload keeps the old environment) |
| `FOLIO_SUPABASE_ANON_KEY` rejected / 401 from Supabase | The key belongs to another project (a local key against hosted, or the reverse) |
| A tool does not appear | Check the config location and restart the client; VS Code namespaces the tools by the server name |

The server writes protocol messages to stdout and startup errors to stderr. Do
not add `console.log` to its source; the guard test rejects it.

## Limitations

- No remote HTTP endpoint or OAuth in v1; the server is local stdio.
- No local mirror: notes are fetched on demand.
- No attachment bytes, sharing, trash, permanent delete, attachment deletion,
  pin or archive tools.
- No in-app AI assistant; the external client is the chat.
- A read token used for a write call fails with the scope message; use a write
  token deliberately.
