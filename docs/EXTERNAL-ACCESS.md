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
  attachments, pin or archive. Those stay in the app, behind the owner's UI.

A token resolves to its account inside the database. It sees exactly what that
account can see: notes it owns plus notes shared with it. No tool accepts an
owner id, so one account cannot ask for another account's data.

External access belongs to the vault's **owner account** — the first account
created in the vault. Every other account signed into Folio, including accounts
a notebook is shared with, does not see Settings → External access and cannot
create tokens. If your content lives across two accounts, share the notebooks
with the owner account (read or edit) and the owner's tokens will see them.

## Security model

- Tokens are created only by the owner, shown once, and stored as SHA-256
  hashes. They are `read` or `write`, expire, and can be revoked immediately.
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

## Configure VS Code Copilot

VS Code 1.143 reads the native `mcpServers` format from the workspace-root
`.mcp.json` or from `~/.copilot/mcp-config.json`. The old
`.vscode/mcp.json` + `inputs` format belongs to the deprecated Local harness
and is not used here.

```json
{
  "mcpServers": {
    "folio": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/Folio/mcp/dist/folio-mcp.cjs"],
      "env": {
        "FOLIO_SUPABASE_URL": "https://<project-ref>.supabase.co",
        "FOLIO_SUPABASE_ANON_KEY": "<publishable-key>",
        "FOLIO_TOKEN": "${FOLIO_TOKEN}"
      }
    }
  }
}
```

- `FOLIO_SUPABASE_URL` is the project URL.
- `FOLIO_SUPABASE_ANON_KEY` is the publishable/anon key. It is public.
- `FOLIO_TOKEN` is a reference. Set the actual token in the environment of the
  host that launches VS Code — a user environment variable or a local launcher
  that reads it from your password manager. Never put the token in the tracked
  `.mcp.json`, a repository file, or a prompt.

Restart VS Code or reload the MCP server after changing the config. The tools
appear as `search_notes`, `get_note`, `create_note`, and so on; the client
namespaces them by the server name.

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

Then create a token in the local app's Settings → External access and point the
client at:

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
        "FOLIO_TOKEN": "${FOLIO_TOKEN}"
      }
    }
  }
}
```

The local publishable key is in `npx supabase status` / `.env.local`. The token
is local-only; never reuse it against the hosted project.

## Troubleshooting

| Message | Meaning |
| --- | --- |
| `The Folio token is invalid, expired, revoked, or lacks the required scope.` | Create a new token, check read vs write, or revoke/recreate |
| `The note changed since it was read...` | Re-run `get_note` and use the current `version` |
| `The note is in the trash and cannot be changed.` | Restore it in the app first |
| `This token has reached its daily call limit.` | Wait for the next day or use another token |
| The server does not start | Check `FOLIO_SUPABASE_URL`, `FOLIO_SUPABASE_ANON_KEY`, `FOLIO_TOKEN`, Node 20+, and the `.cjs` path |
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
