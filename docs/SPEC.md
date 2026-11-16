# Folio — Product specification (v1)

Status: build-ready definition. Last updated: 2026-11-12.
Post-v1 extension: external access via scoped personal access tokens and a local MCP server (section 6.12; decision record in `docs/adr/0001-external-access-mcp.md`).
Working name: **Folio**. Rename before first deploy if desired.

---

## 1. Final product definition

**Folio v1 is a private, card-based notes web app for one heavy note-taker and their partner: notes are private by default, selected notes are shared per note as read-only or editable, the app works on desktop and as an installable mobile app, and the entire vault can be exported to portable Markdown, HTML, and JSON with attachments at any time.**

It replaces Joplin for daily use by removing device-to-device sync, adding selective per-note sharing, and presenting a calmer, card-based interface. It takes inspiration from Supernotes' speed and card model and Notesnook's clean editor, without the subscription or closed platform.

### What v1 is

- One fast workspace: sidebar, card/list of notes, rich-text editor.
- Organization with notebooks (nested), tags, pinned notes, archive, and trash.
- Full-text search designed for thousands of notes.
- Per-note and per-notebook sharing with a partner: `read` or `edit`, revocable, owner-controlled. A notebook share covers its whole subtree.
- Private attachments, including inline images.
- Import from Joplin's Markdown export.
- Export: Markdown/HTML per note, zip of the whole vault with attachments, and a JSON backup.
- Installable PWA that behaves well on phones and desktop browsers.

### What v1 is not

- Not a Notion replacement: no blocks, databases, formulas, or team workspaces.
- Not a real-time collaborative editor: no CRDT, no simultaneous character-level editing.
- Not an E2EE product: data is encrypted in transit and at rest by Supabase, but the project owner can read it.
- Not an offline-first app: no offline editing in v1.
- Not a native app: no App Store or Play Store builds.
- Not a public publishing tool: no public links in v1.
- Not a self-hosted packaging project: the stack is portable, but v1 runs on managed Supabase and Vercel.

---

## 2. Product objectives

| ID | Objective | Measurable target |
| --- | --- | --- |
| O1 | Replace Joplin as the owner's daily notes app | Joplin vault imported with notebooks, tags, notes, and attachments; owner uses Folio as the primary vault |
| O2 | Selective sharing that actually works | Partner can open a shared note on phone and desktop, and can edit it when granted; server-side tests prove no access to unshared notes |
| O3 | Organized but simple | Any note is reachable in at most three actions (search, notebook/tag, or recent list); no workspace setup beyond an account |
| O4 | Data is never trapped | A full-vault export produces every owned note as Markdown plus every attachment plus a manifest; a single note exports without loss |
| O5 | Fast at scale | p95 search under 300 ms with 5,000 seeded notes; note open under 500 ms warm; autosave acknowledged under 1 s; list scrolling stays smooth with pagination |
| O6 | Near-zero running cost | Text vault and normal attachment use fit Supabase Free + Vercel Hobby; approaching storage limits is visible and documented before it becomes a surprise |
| O7 | Sync stops being a chore | No manual sync action exists; server writes are the source of truth; version checks prevent silent overwrites |

---

## 3. Users and jobs

| User | Description | Jobs |
| --- | --- | --- |
| Owner | Heavy note-taker with a large Joplin vault, desktop and phone | Capture quickly, keep notes findable, attach files, share selected notes, export everything, trust that nothing is lost |
| Partner | Occasional collaborator with an account on the same instance | Find notes shared with them, read them on a phone, edit when allowed, not see anything else |

The data model supports more than two users, but the UX is optimized for direct sharing with a known person.

---

## 4. Source brief and decisions

### Original needs

- Shared notes with a partner, with sharing needed on some notes rather than all.
- Notion feels overly complex; Google Keep feels too simple and hard to organize.
- Must work well on mobile and web.
- Information must be easy to export.
- A large number of existing notes.
- Attachments and other content attached to notes.
- Hosting is possible.
- Joplin is the current tool, but device sync is poor, there is no sharing with other users, and the UI is disliked.
- Supernotes and Notesnook are appealing, but paying for them is not desired.
- The app must be separate from ExpenseTracker.

### Confirmed decisions

| Decision | Choice |
| --- | --- |
| Product shape | Separate app and repository, not a module inside ExpenseTracker |
| Sharing model | Per-note `read` or `edit`, chosen by the owner |
| Editing experience | WYSIWYG rich text with Markdown-style input shortcuts |
| Mobile delivery | Installable PWA |
| Migration | Import from Joplin's Markdown export |
| Backend | Supabase (new, separate project recommended) |
| Hosting | Vercel, manual production deploy |
| Collaboration depth | Realtime refresh + version-checked autosave; no CRDT |
| External AI access | Model-agnostic MCP client; local stdio adapter; scoped personal access tokens; no in-app AI or provider keys in v1 |
| External write safety | Scoped tokens, version checks, audit/undo, no destructive tools |

### Rejected alternatives

| Alternative | Why rejected |
| --- | --- |
| Memos | Closest free card UI, but sharing is link/visibility based, not per-person edit access |
| Notesnook self-hosted | Self-hosted sync is unofficial; no per-note sharing with another user |
| Supernotes | Closed SaaS, subscription, no self-hosting |
| Notion / AppFlowy / Affine / Docmost | Workspace/document model is the complexity the owner wants to avoid |
| Joplin server | Better sync than Joplin's file backends, but no real per-note collaboration and the UI remains the problem |
| Google Keep / Apple Notes | Too little organization and export control |
| Obsidian shared vault | Sharing is all-or-nothing at vault level |
| Building on ExpenseTracker | User explicitly wants a separate app and deployment |

---

## 5. Product principles

1. **Capture first.** New note and save must never be buried behind organization.
2. **Private by default, shared by exception.** A share is a deliberate act per note.
3. **One source of truth.** The database is authoritative; no sync folders, no device pairing.
4. **Portable by construction.** Every note is HTML in the database and exports to Markdown/HTML; attachments travel with exports.
5. **Simple surface, real power underneath.** Notebooks, tags, search, and sharing, but no workspace/builder concepts.
6. **Mobile is not a second-class view.** Same features, adapted navigation and editing.
7. **Nothing is silently lost.** Version checks, draft recovery, soft delete, and tested exports.

---

## 6. Functional requirements

Acceptance criteria are testable and apply to v1 unless marked otherwise.

### 6.1 Accounts and identity

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-A1 | Sign in with Google OAuth or email magic link | Both paths create a session; session survives reload; sign-out clears it |
| FR-A2 | Display name and avatar/color for sharing UI | Name comes from provider metadata or profile edit; shown on share rows and "shared by" labels |
| FR-A3 | Private by default | A new account sees zero notes and zero attachments belonging to others |
| FR-A4 | Account lookup for sharing | Owner can find an existing account by exact email; no fuzzy directory browsing |
| FR-A5 | Signup is open but inert | A stranger can create an account but sees an empty app; RLS tests prove isolation |

### 6.2 Notes and editor

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-N1 | Create, edit, and read notes with a title and rich-text body | New notes open in edit mode with title focus; existing notes open in view mode; an Edit/Done toggle in the corner swaps modes and clicking the body never enters edit mode; reload preserves content |
| FR-N2 | Formatting set | Paragraphs, H1–H3, bold, italic, strike, inline code, links, bullet/numbered/task lists, blockquote, code block, horizontal rule, tables, inline images, file attachment cards |
| FR-N3 | Markdown-style shortcuts while typing | `# `, `- `, `1. `, `> `, triple-backtick code blocks, `**text**`, and `[text](url)` produce the corresponding formatting or hint |
| FR-N4 | Autosave with clear state | Saves wait for a ~3 s quiet period after typing stops, with a hard cap forcing at least one save every 15 s during continuous typing; status is a fixed-size icon in the note header (saving/saved/error), so the header never shifts; retry keeps local content |
| FR-N5 | Optimistic concurrency | Every save sends the last known version through `save_note`; a stale version raises a conflict, never overwrites |
| FR-N6 | Conflict recovery | On conflict, the local draft is kept and a banner opens an expandable review showing both versions side by side, offering "Keep mine" and "Use server version". Roadmap: a git-style diff-by-default view with a button to fully expand both versions |
| FR-N7 | Draft recovery | Unsaved local changes survive reload/crash for the open note; recovery is offered, not forced |
| FR-N8 | Undo/redo within the editing session | Standard editor shortcuts work |
| FR-N9 | Pin and archive | Owner can pin/unpin and archive/unarchive; pinned notes sort first; archived notes leave the main list |
| FR-N10 | Soft delete and trash | Delete moves to Trash; restore works; permanent delete is possible from Trash only; shared users lose access immediately when a note is trashed |
| FR-N11 | Note metadata | Show created, updated, and last edited by; `updated_at` changes on content or organizational changes |
| FR-N12 | Empty state | A new empty note is not saved until it has a title or body content |
| FR-N13 | Link handling | In edit mode, tapping a link shows a small "Open link" card near the link instead of navigating; in view mode, links open directly in a new tab |

### 6.3 Organization

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-O1 | Notebooks with optional nesting | Create, rename, move, delete; notebooks reorder and nest by drag (drop before, inside, or after a row) and the tree remembers which notebooks are collapsed; deleting a notebook moves its notes to Unfiled, it does not delete them |
| FR-O2 | Unfiled inbox | Notes without a notebook appear in Unfiled; new notes default there unless a notebook is active |
| FR-O3 | Tags | Create, rename, delete tags; add/remove tags per note; tag list shows counts; tags are owner-only even on shared notes |
| FR-O4 | Views | All notes, Pinned, Shared with me, each notebook, each tag, Archived, Trash |
| FR-O5 | Card grid and compact list | Both views show title, snippet, tags, updated time, and badges (shared, attachment); choice persists |
| FR-O6 | Sorting | Updated (default), created, title; pinned always first; direction toggle where meaningful |
| FR-O7 | Pagination | Notes load in pages (default 30) with infinite scroll; the app never fetches the whole vault into memory |

### 6.4 Search

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-S1 | Full-text search over title and body | Ranked results; language-neutral config; partial words found via trigram fallback |
| FR-S2 | Search filters | Filter results by notebook and tag |
| FR-S3 | Command palette | Cmd/Ctrl+K opens search and quick actions; arrow keys and Enter work; Esc closes |
| FR-S4 | Search scale | Seeded 5,000 notes return p95 under 300 ms locally; no client-side full scan |
| FR-S5 | Result context | Each result shows title, snippet, notebook/tag, and updated time |

### 6.5 Sharing

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-SH1 | Share one note with an existing account by exact email | Owner chooses `read` or `edit`; row created; duplicate shares update the existing row |
| FR-SH2 | Manage access | Owner sees all recipients and permissions; can change permission or revoke; revocation takes effect without the recipient reloading |
| FR-SH3 | Shared with me | Recipient sees shared notes in a dedicated view with a permission badge |
| FR-SH4 | Server-enforced read-only | A reader cannot update through UI, direct API calls, or storage policies; pgTAP proves it |
| FR-SH5 | Editor limits | An editor may change title and body only; cannot share, revoke, move notebook, pin, archive, delete, edit tags, or delete attachment records |
| FR-SH6 | Realtime behavior | Share/unshare and content changes reflect live; open clean notes refresh; dirty notes show a conflict banner |
| FR-SH7 | No public links | No anonymous read path exists in v1 |
| FR-SH8 | Self-share and owner-share blocked | Owner cannot share with themselves; share targets must exist |

### 6.6 Attachments

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-AT1 | Upload files and images | File picker, drag-and-drop, and paste; image MIME types render inline; other files render as download cards |
| FR-AT2 | Limits | Default 20 MB per file, configurable; upload errors are clear; no silent truncation |
| FR-AT3 | Private storage | Bucket is private; access is granted by note access; signed URLs expire (default 1 h) and refresh on note open |
| FR-AT4 | Attachment ownership | Editors may add attachments; only the note owner may delete attachment records or the note |
| FR-AT5 | Cleanup | Permanent note deletion removes its storage objects; failed cleanup is retryable and visible |
| FR-AT6 | List signal | Cards show an attachment count badge |

### 6.7 Import

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-I1 | Joplin import | Select a `.jex` export; create notebooks from Joplin notebooks, notes from `.md` items, attachments from resources, tags when present |
| FR-I2 | Link rewriting | Joplin resource links (including `:/id` and relative resource paths) become working inline images or attachment cards |
| FR-I3 | Import safety | HTML/Markdown is sanitized; scripts and event handlers are stripped; import runs through the normal create path |
| FR-I4 | Import report | Show counts of notes, notebooks, attachments, tags, skipped files, and errors; no silent failures |
| FR-I5 | Import isolation | Import under a root notebook named `Imported from <source> — YYYY-MM-DD`; re-import may duplicate and must warn |
| FR-I6 | Fidelity fallback | If Joplin's Markdown export loses notebook/tag hierarchy, document a per-notebook export path or add a JEX parser before calling migration complete |
| FR-I7 | Folio restore | A Folio vault zip or JSON backup re-imports notebooks, tags, timestamps, and archived state; vault attachments carry their bytes, JSON attachments are re-fetched from the same account's storage and reported when missing |
| FR-I8 | Format detection | One import control accepts `.jex`, `.zip`, and `.json`; the bytes pick the parser, the file name is only a fallback, and an unknown file gets one clear message |

### 6.8 Export and backup

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-E1 | Single-note export | Markdown with YAML front matter (title, notebook, tags, created, updated) and HTML; a zip variant includes its attachments |
| FR-E2 | Full-vault export | Zip with one Markdown file per owned note, folder structure mirroring notebooks, `attachments/<note-id>/...`, `manifest.json`, and `README.txt` |
| FR-E3 | JSON backup | Full HTML bodies plus notebooks, tags, note metadata, and attachment manifest; excludes auth credentials and share rows |
| FR-E4 | Scope clarity | Full export includes owned active and archived notes, excludes Trash; shared-with-me notes are not in the full export but can be exported individually |
| FR-E5 | Large export handling | Progress and cancel; batches attachment downloads; no unbounded memory spike for the target vault |
| FR-E6 | Portability guarantee | Exported Markdown is readable without Folio; no proprietary container is required to recover text |
| FR-E7 | Restore | The vault zip and the JSON backup both re-import through Settings → Import; everything lands under a dated root notebook and never overwrites existing notes; JSON attachments are re-fetched from the same account's storage and reported when missing |

### 6.9 PWA, mobile, and offline behavior

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-P1 | Installable PWA | Valid manifest and icons; installs to home screen on iOS/Android; opens standalone |
| FR-P2 | Responsive | No horizontal scroll at 320px; touch targets ≥ 44px; inputs ≥ 16px to avoid iOS zoom; safe-area insets respected |
| FR-P3 | Mobile navigation | List → note → back flow; sidebar becomes a drawer; primary actions reachable with one hand |
| FR-P4 | Mobile editing | Formatting toolbar stays reachable above the keyboard; long notes scroll without layout jumps |
| FR-P5 | Offline shell | App shell loads offline; a persistent offline banner appears; navigation to cached UI is allowed |
| FR-P6 | Offline boundaries | Saves wait for connectivity; local drafts persist; full offline read/edit and deferred sync are out of v1 |

### 6.10 Realtime and reliability

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-R1 | Live list updates | Shared/unshared notes and content changes update lists without a manual refresh |
| FR-R2 | Open-note updates | A clean open note reflects remote changes; a dirty note never accepts them silently |
| FR-R3 | Save failure handling | Network or server failure surfaces an error, keeps the draft, and retries without duplicate versions |
| FR-R4 | Reconnect | After reconnect, version checks reconcile; no lost local edits |

### 6.11 Settings and operations

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-SET1 | Profile settings | Edit display name; choose theme (light/dark/system); sign out |
| FR-SET2 | Storage awareness | Show attachment usage against the configured limit in settings (informational) |
| FR-SET3 | Empty trash | Explicit owner action; confirmation required; removes notes and attachments |
| FR-SET4 | Errors | Toasts for recoverable errors; inline errors for forms; no raw database messages |
| FR-SET5 | Account deletion | Not in v1; owner can remove accounts through Supabase tooling |

### 6.12 External access (MCP) — post-v1 extension

External clients (VS Code Copilot first, any MCP client later) can read and
manipulate the owner's notes and notebooks through scoped personal access
tokens. Folio does not call an AI provider; the external client fetches notes
on demand and decides what to send to its model. Model-agnostic by design.

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-X1 | Personal access tokens | Owner can create, name, scope (`read`/`write`), expire, and revoke tokens in Settings → External access; the raw token is shown once and stored only as a SHA-256 hash; the table is not readable through the API |
| FR-X2 | Owner-only creation | Only the owner profile can create tokens; the partner's Settings does not expose the card and the RPC refuses |
| FR-X3 | Account-wide visibility | A token sees exactly what its account can see: owned notes plus notes shared with the account (note or notebook shares); no tool accepts an owner/account parameter |
| FR-X4 | Read tools | `search_notes`, `get_note`, `list_notes`, `list_notebooks`, `list_tags`, `get_vault_overview` return the same data the app would show that account |
| FR-X5 | Write tools | `create_note`, `update_note` (expected version; replace/append/prepend), `move_notes`, `add_tags`, `remove_tags`, `create_notebook`, `rename_notebook`; content edits follow the account's edit permission; structural changes are owner-only |
| FR-X6 | Write safety | No sharing/revoke, trash/permanent delete, empty trash, attachment deletion, or pin/archive tools in v1; updates use the version-checked save path and reject stale versions; Markdown is sanitized with the editor allowlist before storage |
| FR-X7 | Audit and undo | Every call is recorded (token, tool, note ids, status, time; never note bodies in logs); content updates keep a before-snapshot and can be undone from Settings when the note has not changed since |
| FR-X8 | Rate limits and revocation | Per-token daily call cap; revocation takes effect on the next call; expiry and last-used are visible |
| FR-X9 | MCP adapter | A local stdio MCP server exposes the read/write tools to MCP clients; a single bundled file runs with Node and no runtime npm install; invalid/revoked/read-only tokens fail with a clear message |
| FR-X10 | No service role | Neither the MCP server nor the browser holds a service-role key; every tool RPC authenticates the token and enforces access in the database |

The adapter targets the current VS Code Copilot harness: native `mcpServers`
configuration (workspace-root `.mcp.json` or `~/.copilot/mcp-config.json`) and
`${FOLIO_TOKEN}` environment references. The deprecated `.vscode/mcp.json` /
`inputs` format is not supported; the token value lives in the host environment,
never in the configuration file.

---

## 7. UX definition

### 7.1 Desktop layout

Three panes:

1. **Sidebar (≈260 px):** product mark, search/command trigger, All notes, Pinned, Shared with me, notebook tree, tags, Archived, Trash, settings.
2. **Note list (≈360 px or card grid):** active view, sort control, view toggle (cards/list), note cards with title, snippet, tags, updated time, and badges. Includes a primary New note action.
3. **Editor (flexible):** title, metadata row, formatting toolbar, rich-text canvas, attachment area, share and note-menu actions.

The editor can be closed on narrower desktops so the list expands. Sidebar contains no nested workspaces.

### 7.2 Mobile layout

- **List screen:** top bar with menu, view title, and search; card/list of notes; floating New note button.
- **Note screen:** back, title, actions menu (share, pin, archive, delete, export); formatting toolbar docked above the keyboard; body takes the full viewport.
- **Drawer:** notebooks, tags, views, settings.
- Dialogs are full-screen sheets on phones.

### 7.3 Key flows

1. **Capture:** New note → type title/body → autosave → close. No modal setup.
2. **Organize:** open note → pick notebook from header; add tags inline. Bulk actions are not v1.
3. **Find:** Cmd/Ctrl+K → type → arrows/Enter → open; or filter via sidebar.
4. **Share:** note menu → Share → email + read/edit → see recipient list → done. Partner sees it under Shared with me.
5. **Attach:** toolbar/drag/paste → upload → inline image or file card.
6. **Export:** settings → Export all → choose zip/JSON → progress → download. Single note from its menu.
7. **Import:** settings → Import from Joplin → choose folder → preview/report → import.
8. **External access:** settings → External access → create a read or write token → copy it once → set it in the host environment for the local MCP server → revoke a device when needed.

### 7.4 Shortcuts

`Cmd/Ctrl+K` search palette, `Cmd/Ctrl+N` new note, `Cmd/Ctrl+S` force save, `Esc` close dialog/palette, `?` shortcuts help. Editor shortcuts follow the platform.

### 7.5 Visual direction

- Calm, card-based, generous whitespace, strong typography; closer to Supernotes than Notion.
- System font stack for speed; optional display font later.
- Design tokens for color, spacing, radius, shadow; light, dark, and system themes.
- One accent color; sharing badges use a distinct but quiet treatment.
- Motion limited to 150–200 ms transitions; respect `prefers-reduced-motion`.
- Accessibility: WCAG AA contrast, visible focus, keyboard reachable controls, labeled icon buttons, no color-only status.

---

## 8. Data model

All tables in the `public` schema unless noted. IDs are UUIDs. Timestamps are `timestamptz`.

### `profiles`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | References `auth.users(id)` on delete cascade |
| `email` | text unique | Lowercased; kept in sync from auth |
| `display_name` | text | From provider metadata or user edit |
| `is_owner` | boolean | Default false; gates external token management. Not exposed through the API column grants. |
| `created_at`, `updated_at` | timestamptz | |

A public view or RPC exposes only `id` and `display_name` to other authenticated users.

### `notebooks`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `owner_id` | uuid | References `profiles(id)`, cascade |
| `parent_id` | uuid null | Self-reference; same owner enforced |
| `name` | text | 1–120 chars |
| `position` | int | Manual order |
| `created_at`, `updated_at` | timestamptz | |

### `notes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `owner_id` | uuid | References `profiles(id)`, cascade |
| `notebook_id` | uuid null | References `notebooks(id)`, set null on notebook delete |
| `title` | text | Default `''` |
| `body_html` | text | Sanitized rich text |
| `body_text` | text | Derived plain text for search/snippets |
| `search` | tsvector | Generated from title + body_text, `simple` config |
| `pinned`, `archived` | boolean | Default false |
| `deleted_at` | timestamptz null | Trash marker |
| `version` | int | Starts at 1; increments on content saves |
| `last_edited_by` | uuid null | References profiles |
| `created_at`, `updated_at` | timestamptz | |

Indexes: `(owner_id, updated_at desc) where deleted_at is null`, `(notebook_id)`, GIN on `search`, GIN trigram on `title` and `body_text`, partial index for trash.

### `tags` and `note_tags`

- `tags(id, owner_id, name, color, created_at)`, unique `(owner_id, lower(name))`.
- `note_tags(note_id, tag_id)` with composite PK; cascade on either side.

### `note_shares`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `note_id` | uuid | References notes, cascade |
| `shared_with` | uuid | References profiles, cascade |
| `permission` | text | `read` or `edit` |
| `created_by` | uuid | Owner who created the share |
| `created_at`, `updated_at` | timestamptz | |

Unique `(note_id, shared_with)`. A trigger rejects self-shares and shares where `shared_with` is the note owner.

### `attachments`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `note_id` | uuid | References notes, cascade |
| `owner_id` | uuid | Who uploaded it |
| `storage_path` | text unique | `{note_id}/{attachment_id}.{ext}` in `note-attachments` |
| `file_name` | text | Original name |
| `mime_type` | text | |
| `size_bytes` | bigint | |
| `created_at` | timestamptz | |

### External access tables (post-v1)

| Table | Columns | Notes |
| --- | --- | --- |
| `api_tokens` | `id`, `owner_id`, `name`, `token_hash`, `prefix`, `scope` (`read`/`write`), `created_at`, `last_used_at`, `expires_at`, `revoked_at` | Owner-only; RLS enabled; no direct API grants; managed through RPCs |
| `api_usage` | `token_id`, `day`, `calls` | Daily call cap; primary key `(token_id, day)` |
| `api_audit` | `id`, `owner_id`, `token_id`, `tool`, `status`, `note_ids`, `summary`, `before_snapshot`, `created_at` | Metadata only; `before_snapshot` only for content updates; owner-readable |

### Database logic

- `profiles` is populated/updated by a trigger on `auth.users`.
- `notes` trigger derives `body_text` from `body_html` and refreshes `search`; it also touches `updated_at`.
- `can_read_note(note_id)` and `can_edit_note(note_id)` are security-definer helpers with a fixed `search_path`, used by RLS and storage policies.
- `can_read_note` is true for the owner, and for a recipient only when the note is not trashed. `can_edit_note` is true for the owner or an `edit` share only while the note is active.
- `save_note(note_id, expected_version, title, body_html)` is a security-definer RPC that:
  - verifies owner or `edit` share,
  - refuses when `deleted_at` is set (trash is read-only for saves),
  - updates title/body only,
  - increments `version`, sets `last_edited_by` and `updated_at`,
  - raises a conflict error when the expected version does not match.
- `api_authenticate(required_scope)` reads the `x-folio-token` header, hashes the token, checks owner/scope/expiry/revocation, updates `last_used_at` and the daily counter, and returns the owner. Its EXECUTE is revoked from `public`, `anon`, and `authenticated`; only the tool RPCs call it.
- The `api_*` tool RPCs are security-definer functions with a fixed `search_path`. Each calls `api_authenticate`, sets the request claims to the token owner, and filters explicitly with `owns_note` / `can_read_note` / `can_edit_note` / `owns_notebook` (a definer bypasses RLS, so explicit checks are mandatory). `anon` EXECUTE is deliberate: the token is the credential and every RPC validates it.
- Token management is authenticated-only and owner-gated: `create_api_token`, `list_api_tokens`, `revoke_api_token`, and `can_manage_api_tokens`.
- Notes `INSERT`, `UPDATE`, `DELETE` are owner-only at the table level; editors go through `save_note`.
- `note_shares` is readable by the note owner and the recipient; writes are owner-only.
- Storage: private bucket `note-attachments`; `select` allowed with note read access, `insert` with note edit access, `delete` owner-only.
- Realtime publication includes `notes` and `note_shares` with replica identity full.

### RPCs

- `find_profile_by_email(email)` — authenticated only, exact lowercased match, returns id + display name.
- `save_note(...)` — described above.
- `can_read_note(id)`, `can_edit_note(id)` — helper functions.
- `can_manage_api_tokens()` — owner-only gate for the Settings card.
- `create_api_token(name, scope, expires_at)`, `list_api_tokens()`, `revoke_api_token(id)` — token lifecycle; the raw token is returned once.
- `api_search_notes`, `api_get_note`, `api_list_notes`, `api_list_notebooks`, `api_list_tags`, `api_get_vault_overview` — read tools.
- `api_create_note`, `api_update_note`, `api_move_notes`, `api_add_tags`, `api_remove_tags`, `api_create_notebook`, `api_rename_notebook` — write tools.
- Optional `purge_note(id)` for coordinated cleanup; storage deletion may remain client-side with RLS.

---

## 9. Permission matrix

| Action | Owner | Editor share | Reader share | Stranger |
| --- | --- | --- | --- | --- |
| See note | Yes (including trashed) | Yes while active | Yes while active | No |
| Edit title/body | Yes | Yes via `save_note` | No | No |
| Change notebook | Yes | No | No | No |
| Pin/archive | Yes | No | No | No |
| Delete/restore | Yes | No | No | No |
| Add/remove tags | Yes | No | No | No |
| Create/change/revoke shares | Yes | No | No | No |
| See share list | Yes | Own row only | Own row only | No |
| Read/download attachments | Yes | Yes | Yes | No |
| Upload attachments | Yes | Yes | No | No |
| Delete attachment records | Yes | No | No | No |
| Export note | Yes | Yes (single note) | Yes (single note) | No |
| Appear in full-vault export | Yes | No (not their vault) | No | No |

### 9.1 External token matrix (post-v1)

| Action | Read token | Write token |
| --- | --- | --- |
| Search/read notes owned by the token's account | Yes | Yes |
| Read notes shared with the token's account | Yes | Yes |
| Read another account's unshared notes | No | No |
| Edit title/body of owned notes | No | Yes |
| Edit title/body of edit-shared notes | No | Yes |
| Move notes, add/remove tags, rename notebooks | No | Owned notes/notebooks only |
| Create notes/notebooks | No | Yes (owned) |
| Share/revoke, trash/permanent delete, empty trash, delete attachments, pin/archive | No | No |
| Read the audit trail / manage tokens | No | No (owner UI only) |

Every row is enforced in SQL and covered by pgTAP, including direct RPC calls
with a missing, invalid, expired, revoked, or wrong-scope token.

Server-side tests must cover every row, including direct REST/RPC attempts, not just UI behavior.

---

## 10. Performance and scale

- Target vault: 10,000 notes, 1 GB of attachments. Design and test at 5,000 notes for v1.
- Search p95 < 300 ms locally; note open < 500 ms warm; autosave acknowledged < 1 s; initial load < 2 s on broadband.
- Lists paginate at 30; editor loads one note at a time; images lazy-load.
- Full export of 5,000 notes + 1 GB attachments targets under 5 minutes on broadband with progress and cancellation.
- Attachment signing refreshes on open; no long-lived public URLs.
- Seed script (local/dev only) generates 5,000 notes and representative attachments for load checks.

---

## 11. Security and privacy

- **RLS everywhere.** Every user table and storage object is protected by policies. pgTAP tests are the gate.
- **Least privilege.** No service-role key in the browser. Editors cannot modify ownership, notebook, shares, or deletion state.
- **HTML safety.** Imported Markdown is sanitized with DOMPurify; all HTML rendered read-only is sanitized on render, never injected directly; the editor parses through the TipTap schema. Set a restrictive Content Security Policy on Vercel.
- **Private attachments.** Signed URLs with short expiry; never a public bucket.
- **Account lookup.** Exact email match only, authenticated callers only; this reveals whether an account exists, accepted for a private two-person app. Invite codes can replace it later.
- **No E2EE in v1.** Supabase can read stored content; the partner can read shared notes. This is a documented trade-off versus Notesnook.
- **External access.** Tokens are owner-created, account-scoped, hashed at rest, expiring, revocable, and audited. The local adapter receives the token from a host environment variable; it is never written into the MCP configuration. Tool RPCs authenticate the token and filter explicitly in SQL; no client receives a service-role key. The API exposes no sharing, deletion, or attachment-deletion tools. Note content is returned to the external client on demand; Folio does not call an AI provider, and the external client's model terms govern what happens after the tool result.
- **Prompt injection.** Notes are untrusted input to an external model. Read-only tokens are the default; write tokens are opt-in; writes are version-checked and audited; content updates keep a before-snapshot for undo.
- **Logs.** Never log note bodies, attachment contents, tokens, or full emails in client or server logs.
- **Backups.** Depend on Supabase's plan-level backups plus the app's own JSON/Markdown export. Test the export before relying on it.
- **Destructive operations.** Trash is soft; permanent delete requires confirmation; hosted destructive RPCs are never run by automated tooling.
- **Secrets.** `.env.local`, `supabase/.env*.local`, and `.vercel` stay gitignored; no keys in docs or commits.

---

## 12. Open questions

1. Final product name and domain.
2. Separate Supabase project (recommended) or a `notes` schema in the current project.
3. English-only UI in v1, or i18n from the start (ExpenseTracker already supports multiple languages).
4. Attachment per-file limit (default 20 MB) and acceptable monthly storage cost.
5. Exact Joplin Markdown export fidelity (notebooks, tags, timestamps) — verify with a real export.
6. Should signup be invite-only rather than open-with-RLS?
7. Priority of restore-from-backup versus v1 shipping without it. — decided 2026-11-12: restore ships; both Folio exports re-import (FR-I7, FR-E7).
8. Whether email notifications for new shares are needed later.
9. Whether public read-only links should ever be added (explicitly out of v1).
10. Remote MCP transport/OAuth, an approval queue for external writes, per-notebook token scope, pin/archive tools, and attachment access — all deferred to Phase 8.5.

---

## 13. v1 definition of done

- [ ] Owner can sign in, create/edit/format notes, organize with notebooks and tags, search, pin, archive, trash/restore, and permanently delete.
- [ ] Owner can attach images and files, view/download them, and see attachment badges.
- [ ] Owner can share a note as read-only or editable and revoke access.
- [ ] Partner can sign in, see shared notes, edit when allowed, and cannot read or write anything else — proven by pgTAP tests.
- [ ] Realtime updates and version conflicts behave as specified; no silent overwrites in tests.
- [ ] Full-vault export and single-note export work, including attachments and manifest.
- [ ] A real Joplin `.jex` export imports with notebooks, tags, notes, and attachments (or the documented fallback is implemented).
- [ ] A Folio vault zip and a Folio JSON backup restore notebooks, tags, timestamps, archived state, and attachments without overwriting anything.
- [ ] 5,000-note seed meets the performance targets in local testing.
- [ ] PWA installs and the app is usable at 320px, 768px, and desktop widths.
- [ ] Accessibility pass: keyboard navigation, focus states, labels, AA contrast.
- [ ] Supabase migrations applied to the hosted project; Vercel production deploy completed; both users smoke-tested.
- [ ] `docs/PLAN.md` and this spec reflect the shipped behavior; no known critical security issues.

---

## 14. Post-v1 external access definition of done (Phase 8)

- [ ] The owner can create, name, scope (`read`/`write`), expire, and revoke tokens in Settings → External access; only the SHA-256 hash is stored and the raw token is shown once.
- [ ] The partner cannot create tokens; the owner-only gate is enforced in SQL, not only in the UI.
- [ ] A token sees exactly what its account sees (owned plus shared), and pgTAP proves another account's unshared notes are unreachable.
- [ ] The local MCP server runs from a single bundled file on two devices and exposes the read tools; a read-only Copilot session works against the real vault.
- [ ] Write tools create/update/move/tag/rename with version checks; a stale version, a read-only token, a revoked token, and an expired token all fail with clear errors.
- [ ] Every call is audited; content updates can be undone while the note is unchanged; no note bodies appear in logs.
- [ ] No service role exists in the MCP server or browser; the guard test passes.
- [ ] The database migration ships before the frontend; the web app's existing behavior and gates are unchanged.
