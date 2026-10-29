# Folio — Execution plan

Status: Phases 0-6 complete. Phase 7 (polish and launch) is in progress: the database and frontend are deployed, the smoke test and polish passes remain. Product requirements live in `docs/SPEC.md`; working rules live in `AGENTS.md`.

---

## 1. How this plan is used

- Phases run in order. Do not start a later phase until the previous definition of done is met.
- Every behaviour starts with a failing test: Vitest for TypeScript logic, pgTAP for database access.
- A phase is complete only when its tests pass, `npm run typecheck` and `npm run build` pass, and this file's status is updated.
- The spec is the source of truth for scope. If implementation reveals a gap, update the spec and this plan before coding past it.
- Keep the repository deployable from Phase 1 onward; never leave `main` in a state that cannot build.

---

## 2. Status

| Phase | Status | Gate |
| --- | --- | --- |
| 0 — Definition and docs | Done | This document, spec, agent guide |
| 1 — Scaffold and auth | Implemented — magic link verified; Google pending credentials | App runs, auth works, PWA shell builds |
| 2 — Database and access control | Done — 140 pgTAP assertions green; typed data layer tested | `npx supabase test db` green for the access matrix |
| 3 — Notes experience | Done — workspace, editor, search, browser checks, 5,000-note performance measured | Personal workflow usable end-to-end |
| 4 — Sharing and realtime | Done — share dialog, badges, realtime refresh, conflict banners; two-account run passed | Two accounts share/read/edit correctly |
| 5 — Attachments | Done — inline images, file cards, owner/editor/reader roles, two-account run passed | Images inline, files download, roles enforced |
| 6 — Import and export | Done — real 145-note JEX imported with timestamps and attachments; vault zip and JSON backup verified outside Folio | Real Joplin vault imported; full export verified |
| 7 — Polish and launch | Not started | SPEC v1 definition of done |

---

## 3. Phase 0 — Definition and docs (done)

Deliverables:

- `README.md`, `AGENTS.md`, `docs/SPEC.md`, `docs/PLAN.md`.
- Decisions captured: separate app, per-note read/edit sharing, WYSIWYG, PWA, Joplin Markdown import, Supabase + Vercel.
- Open items listed in `AGENTS.md` and `SPEC.md`.

Exit criteria: the definition is written and the separate project folder exists. **Met.** Owner review of this definition is the gate for starting Phase 1.

---

## 4. Phase 1 — Scaffold and auth

### Tasks

1. Create the Vite + React 18 + TypeScript app in this repository, strict TS.
2. Add scripts: `dev`, `build` (`tsc -b && vite build`), `test` (Vitest), `typecheck`, `preview`, `deploy` (`vercel --prod`).
3. Add ESLint only if it does not slow the phase; formatting is not a gate.
4. Create the folder structure:
   ```text
   src/
     auth/
     components/
     pages/
     db/
     lib/
     styles/
   supabase/
     migrations/
     tests/
   scripts/
   ```
5. Add `.env.example` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; fail clearly when missing. Never commit real values.
6. Build the app shell: CSS tokens, light/dark/system theme, responsive layout skeleton, error boundary, toast host.
7. Supabase client and auth gate: Google OAuth + magic link, session persistence, sign-out, profile bootstrap. Use the local Supabase Inbucket for magic-link testing.
8. Router skeleton for `/`, `/note/:id`, `/shared`, `/archived`, `/trash`, `/settings`. Empty states only.
9. PWA: manifest, placeholder icons, service worker via `vite-plugin-pwa`, offline shell, install metadata. Cache the app shell only; never cache authenticated API responses with the service worker.
10. Create the initial Supabase config (`config.toml`) for local development.

### Tests first

- Unit: environment validation, route/auth state helpers, theme resolution.
- Smoke: app renders signed-out state; sign-in gate does not leak the app shell.
- Build: `npm run typecheck`, `npm run build`, `npm run test`.

### Definition of done

- `npm run dev` renders the signed-out screen against local Supabase.
- Google and magic-link sign-in both work locally; session survives reload; sign-out works.
- Unknown routes render a friendly not-found state.
- PWA manifest is valid and installable in a desktop browser (mobile install verified again in Phase 7).
- No service-role key exists in the frontend bundle.

### Outcome (2026-10-26)

Delivered:

- Vite 7 + React 18 + TypeScript app, Vitest + Testing Library, local Supabase config, and the `.npmrc` workaround for npm 10.9 peer resolution.
- Supabase PKCE auth gate, Google button, magic-link form, friendly config/error screens, responsive app shell, routes, theme selector, and PWA manifest/icons/service worker.
- Tests for environment validation, theme resolution, user display helpers, auth gate transitions, provider discovery, magic-link/Google calls, and the error boundary (37 tests).

Verified:

- `npm run test`, `npm run typecheck`, and `npm run build` pass.
- A real magic-link email was read from Mailpit, opened in headless Chrome, and signed the app in; the session survived a browser restart.
- Light/dark/system themes and the 390px layout render without horizontal overflow.
- The production bundle contains the publishable key but not the secret or service-role key.

Deviations and blockers:

- Google OAuth cannot be verified until a Google client ID/secret is configured. The button is wired and only appears when the Supabase project reports Google as enabled, so there is no dead provider button; the rest of the Phase 1 gate is met.
- The toast host moves to Phase 3; profile bootstrap moves to Phase 2 because the profiles table does not exist yet.
- PWA manifest, icons, and service worker are generated; a real device install check is deferred to Phase 7.
- `npm install` on npm 10.9.2 hits an `edgesOut` peer bug with Vitest 4 optional browser providers; `.npmrc` sets `legacy-peer-deps` as the project workaround.
- `npx supabase start` reports no seed file. Add `supabase/seed.sql` in Phase 2.

Next: configure Google or accept magic-link-only, then start Phase 2.

---

## 5. Phase 2 — Database and access control

### Migrations (numeric, forward-only)

1. `0001_profiles.sql` — profiles table, auth.users trigger, public identity view, RLS.
2. `0002_notebooks_tags.sql` — notebooks, tags, note_tags, indexes, RLS.
3. `0003_notes.sql` — notes, derived text/search trigger, indexes, owner-only RLS.
4. `0004_shares.sql` — note_shares, `can_read_note`, `can_edit_note`, `find_profile_by_email`, `save_note`, share triggers, RLS.
5. `0005_attachments.sql` — attachments table, storage bucket, storage policies, RLS.
6. `0006_realtime.sql` — publication setup for notes and note_shares.

### Tests first (pgTAP, `supabase/tests/`)

- `access_matrix_test.sql`: owner/editor/reader/stranger across notes, notebooks, tags, shares, attachments. Include direct update attempts on owner-only columns and direct inserts into note_shares.
- `save_note_test.sql`: version conflict, editor can save content, reader cannot, trashed note cannot be saved, `last_edited_by`/version/updated_at update correctly.
- `share_lookup_test.sql`: self-share rejected, duplicate share updates, revoke removes access, email lookup exact-match only.
- `search_test.sql`: title/body hits, trashed exclusion, trigram fallback behavior.
- Storage policy tests: path parsing, reader cannot upload, editor can upload, owner-only delete. Add a local integration test with the Supabase client if pgTAP cannot exercise storage fully.

### Data layer

- `src/db/supabase.ts` with typed client.
- Generated or handwritten types for tables, views, RPCs.
- One module per domain: `notes.ts`, `notebooks.ts`, `tags.ts`, `shares.ts`, `attachments.ts`, `profiles.ts`.
- Unit tests with a fake client, following the ExpenseTracker pattern; the fake must fail loudly on unexpected calls.

### Definition of done

- `npx supabase start`, `npx supabase db reset`, and `npx supabase test db` all pass locally.
- The full access matrix is proven for all four roles.
- The typed data layer has unit tests and no `any` leakage at its boundaries.
- No migration references production URLs, real accounts, or destructive operations.

### Outcome (2026-10-27)

Delivered:

- Six forward-only migrations: `profiles`; nested notebooks and tags; notes with derived plain text, FTS and trigram indexes; note shares, `can_read_note`/`can_edit_note` and the version-checked `save_note` RPC; attachment metadata and the private `note-attachments` bucket; realtime publication entries.
- RLS on every user-data table. Profiles are own-row only, with a `public_profiles` view exposing ids and display names for share UI, plus an exact-email lookup RPC. Editor/reader access flows only through shares; notes, notebooks, tags, note-tag links, shares, and attachment records stay owner-controlled.
- `save_note` returns explicit SQLSTATEs the client can distinguish: `40001` conflict, `42501` forbidden, `55000` trashed, `P0002` missing.
- 140 pgTAP assertions covering owner/editor/reader/stranger access, profile updates and email privacy, direct owner-only column attempts, share upsert/revoke/self-share, search, and storage RLS.
- Typed client in `src/db/supabase.ts`, handwritten `src/db/database.types.ts`, six domain modules (`profiles`, `notebooks`, `tags`, `notes`, `shares`, `attachments`) and 106 Vitest tests driven by a fake client that throws on unqueued calls.

Verified:

- `npx supabase start`, `npx supabase db reset`, and `npx supabase test db` all pass locally (140 assertions).
- `npm test` (106), `npm run typecheck`, and `npm run build` pass.
- No `any` exists in application or test code.

Deviations and notes:

- `note_tags` is created in `0003_notes.sql` because it references `notes`; the plan had placed it in `0002`.
- `owner_id` and `created_by` default to `auth.uid()` in the database so the client never supplies identity fields itself.
- Search uses Postgres FTS for terms of three or more characters and a sanitized `ilike` fallback for shorter terms; the trigram indexes support the fallback.
- Tag and "shared with me" list filters were initially resolved client-side; Phase 3 replaced them with the server-side `note_summaries` view.
- Storage policies are proven with pgTAP (bucket privacy, path parsing, role policies, RLS). The full upload/download flow through the Storage API is Phase 5.

Next: Phase 3 (completed below).

---

## 6. Phase 3 — Notes experience

### Tasks

1. TipTap editor with free extensions: headings, lists (including task lists), blockquote, code block, link, image, table, horizontal rule, placeholder.
2. Sanitize HTML with DOMPurify before save and before read-only rendering.
3. Markdown input rules and a compact formatting toolbar (desktop and mobile).
4. Autosave hook: 800 ms debounce, saving/saved/error states, retry, local draft recovery, `save_note` version conflicts.
5. Notes list: card grid and compact list, pagination/infinite scroll, sorting, pinned first, badges.
6. Notebook tree with nesting; create/rename/move/delete; delete moves notes to Unfiled.
7. Tags: create/rename/delete, attach/detach, counts.
8. Views: All, Pinned, notebook, tag, Archived, Trash; restore and permanent delete.
9. Search: server-side FTS query builder, trigram fallback for short/partial queries, filters, command palette, keyboard navigation.
10. Empty states, loading skeletons, error toasts, confirmations for destructive actions.
11. Keyboard shortcuts: Cmd/Ctrl+K, Cmd/Ctrl+N, Cmd/Ctrl+S, Esc.

### Tests first

- Autosave state machine: debounce, queued save, failure retry, conflict, draft recovery.
- Search query builder: terms, quotes, filters, short-query fallback.
- Notebook deletion moves notes to Unfiled (data-layer test).
- Pagination/cursor behavior and sort stability.
- Editor HTML round-trip fixtures: headings, lists, tables, code, links, images.
- Plain-text extraction and snippet generation.

### Definition of done

- Owner can run the full personal workflow locally without sharing or attachments.
- 5,000 seeded notes render paginated lists and search within the target latency.
- No note content is lost across reload, conflict, or failed save in tests.
- Trash, archive, and notebook deletion behave as specified.

### Outcome (2026-10-27)

Delivered:

- Three-pane workspace: sidebar, note list, and editor; a mobile drawer replaces the sidebar below 860px. List cards and compact rows show title, snippet, tags, badges, and relative time.
- TipTap editor with headings, bold/italic/strike/code, links with Markdown input rules, bullet/numbered/task lists, blockquote, code block, horizontal rule, tables, images, and a placeholder. DOMPurify sanitizes before save and read-only rendering.
- 800 ms autosave with saving/saved/error states, retry, local draft recovery keyed by user and note, version conflicts, "reload theirs"/"keep mine", and an offline banner that retries on reconnect.
- Notebook tree with nesting and management dialog; tag management and attach/detach with counts; notebook deletion moves notes to Unfiled (proven in pgTAP).
- Views for All, Pinned, Unfiled, notebook, tag, Shared with me, Archived, and Trash, with pin/archive/trash/restore/permanent delete and confirmations.
- Server-side list filtering via new `note_summaries` and `tag_summaries` views: tags, attachment/share counts, and tag filters arrive in one paginated query. A forward-only `0008_notes_read_policy.sql` adds the direct owner branch to the notes select policy so owner inserts and saves can use `RETURNING`. Search uses FTS plus the short-term fallback; the command palette supports keyboard navigation.
- Settings display-name editing; toasts; loading skeletons; empty states; keyboard shortcuts for search, new note, save, and Escape.
- Local seed utility `scripts/seed-notes.mjs` (5,000 notes, notebooks, and tags) with a localhost-only guard. The seeded vault is available locally as `seed@folio.local`.

Verified:

- `npm test` — 178 Vitest tests; `npm run typecheck` and `npm run build` pass.
- `npx supabase test db` — 158 pgTAP assertions, including profile updates, insert-with-RETURNING under RLS, note summaries, and notebook deletion moving notes to Unfiled.
- Browser acceptance run: magic link sign-in, note creation, reload persistence, list rendering, command palette, simulated version conflict and "keep mine", draft recovery, notebook/tag create and assign/attach, trash/restore, and mobile 390px list/editor/drawer with no horizontal overflow and no unexpected console errors.
- 5,000-note local performance: first page 11 ms, infinite scroll 50 ms, search 227 ms end-to-end (200 ms debounce; DB FTS query ~4 ms), first note open 305 ms including the lazy editor chunk, warm note open 57 ms. Database-only checks: first list page 6 ms, page 100 136 ms, tag filter 76 ms, FTS 4 ms.
- Production build is split: main bundle ~87 KB gzip; the editor loads on demand (ProseMirror ~79 KB, TipTap ~115 KB, editor shell ~18 KB gzip).

Deviations and notes:

- The share dialog and realtime refresh are Phase 4. The editor already respects existing `read`/`edit` share rows and shows a read-only banner when appropriate.
- Attachment upload/download UI is Phase 5. The editor can hold image nodes for later import, but there is no upload flow yet.
- Last-edited-by display names and "shared by" labels are deferred to Phase 4's sharing UI.
- `note_summaries` computes tags, attachment counts, and share counts per returned row. Page 100 is 136 ms at 5,000 notes; revisit if the vault grows well past that.
- The `?` shortcuts-help overlay is deferred to Phase 7 polish.
- The seed script is local-only and refuses non-local URLs; it is not part of the app bundle.
- `NoteEditor.tsx` is about 800 lines. If Phase 4's share controls push it past roughly 1,000, split the header, banners, and tag picker into their own components first.

Next: Phase 4.

---

## 7. Phase 4 — Sharing and realtime

### Tasks

1. Share dialog: exact email lookup, read/edit selection, recipient list, permission change, revoke.
2. Badges on cards and in the editor; "Shared with me" view; "shared by" label.
3. Read-only mode: editing controls hidden/disabled; server still enforces.
4. Realtime: subscribe to note changes and share changes; refresh clean open notes; banner for dirty notes.
5. Conflict banner wired to `save_note` conflicts with "reload theirs" and "keep mine".
6. Share-aware cache invalidation for lists and the open note.

### Tests first

- Share state reducer: add/update/revoke, permission badges, read-only detection.
- Conflict banner decisions: clean vs dirty vs saving.
- Realtime event handling: ignored self-events, remote update while clean, remote update while dirty.
- pgTAP remains the security gate; UI tests must not claim to prove permissions.
- Manual two-browser, two-account acceptance run.

### Definition of done

- Owner shares a note; partner sees it live and can read it.
- Editor permission allows title/body saves; reader permission cannot save through UI or API.
- Revoking removes access immediately in the recipient's UI and on the server.
- Dirty open notes never silently accept remote content.

### Outcome (2026-10-28)

- `ShareDialog.tsx`: exact-email lookup through `find_profile_by_email`, read/edit selection, recipient list with permission changes and revoke. Owners only; the list reloads when a share event arrives.
- `0009_share_summaries.sql` adds `owner_display_name` and `my_share_permission` to `note_summaries`, so cards and the editor can label shared notes without extra round trips.
- Badges: owners see "Shared" or "Shared · n"; recipients see "Shared by {owner}" plus "Read only" or "Can edit", on cards and in the editor.
- Realtime: `useNoteRealtime` holds one channel per open note (`notes` + `note_shares`); `useWorkspaceRealtime` refreshes lists. Clean open notes reload in place; dirty or saving notes get a banner instead. `decideNoteChange`, `decideShareChange`, and `shouldRefreshList` in `src/lib/realtime.ts` are pure and unit-tested.
- Revocation detail: Realtime only sends the primary key on `DELETE`, so the recipient re-reads their own share row (`check-access`) rather than trusting the payload. A missing row flips the editor to "Access removed" and refreshes the list. Found during the two-account run; covered by a unit test.
- The conflict banner covers both `save_note` conflicts and remote changes while dirty, with "Reload theirs" and "Keep mine". Keeping mine re-bases on the server version and saves the local draft.
- `NoteEditor.tsx` reached 1,044 lines on the first pass, so the meta row moved to `NoteMetaRow.tsx` and share state to `useNoteSharing`; the editor is ~940 lines.
- Tests: 224 Vitest tests across 29 files; 164 pgTAP assertions across 6 files; typecheck and production build green.
- Two-account acceptance (owner on `127.0.0.1:5173`, partner on `localhost:5173`): share read-only and it appears live; upgrade to edit unlocks the partner editor live; partner saves and the owner's clean note refreshes; owner edits while the partner is dirty and both resolution buttons work; revoke shows "Access removed" and empties the shared list; both consoles clean.
- Limit: realtime only reaches tabs that are connected; a reconnected tab catches up on its next fetch.

---

## 8. Phase 5 — Attachments

### Tasks

1. Upload paths: file picker, drag-and-drop, paste image.
2. Private bucket integration; path builder `{note_id}/{attachment_id}.{ext}`; signed URL cache with refresh on open.
3. Inline image node keyed by attachment id; file cards with name, size, download.
4. Validation: default 20 MB per file, safe MIME handling, clear errors.
5. Editor upload permission; reader blocked; owner-only attachment deletion.
6. Cleanup on permanent note deletion; retry path and orphan reporting.
7. Settings storage usage indicator.

### Tests first

- Path builder and extension normalization.
- Size/MIME validation and error messages.
- Signed URL refresh logic and expiry handling.
- Attachment HTML node serialization and export rewriting.
- Storage policy tests for read/edit/owner/stranger.
- Manual cross-role upload/download acceptance run.

### Definition of done

- Images render inline on desktop and mobile; non-images download.
- Reader cannot upload; editor can; only owner can delete attachment records.
- Permanent deletion removes storage objects, or reports a retryable error.
- No public object URL exists anywhere in the app.

### Outcome (2026-10-28)

- `src/lib/attachments.ts` holds the rules: refs (`attachment:<uuid>`), MIME/size validation, byte formatting, signed-URL refresh timing, and HTML rewriting between refs and signed URLs. Raster images (`png`, `jpeg`, `gif`, `webp`, `avif`) render inline; SVG, HTML, and XHTML are rejected because they execute script when opened from a signed URL.
- Inline images live in `body_html` as `<img src="attachment:<uuid>">`. The editor renders them through one-hour signed URLs and `restoreHtml` rewrites them back to refs before every save, so the database never stores an expiring URL.
- Data layer: `uploadAttachment` writes the metadata row first (so the storage policy can check a real attachment) and rolls the row back if the upload fails; `createSignedUrls` signs a note's images in one request; `createDownloadUrl` asks Storage for a `Content-Disposition` attachment using the original file name.
- `useNoteAttachments` owns the list, the signing round, the refresh timer (five minutes before expiry), upload validation, and owner-only delete. `useAttachmentActions` owns the editor wiring: paste/drop, inline image insertion, download, and removal. Extracting it kept `NoteEditor.tsx` at 973 lines.
- `AttachmentArea.tsx` lists every attached file as a card under the editor canvas, with a thumbnail for images, name, size, download, and an owner-only remove. This is a deliberate deviation from "inline file node": a custom TipTap node cannot host downloads cleanly, and cards keep the canvas simple. Images still insert inline at the cursor.
- Uploads need a saved note; until the first autosave creates the note the area says "Save the note once to add files."
- Cleanup removes storage objects before the attachment row or note. A failed object delete keeps the record, shows a retryable error, and does not delete the note.
- `0010_attachment_usage.sql` adds a security-definer `attachment_usage()` RPC returning project-wide totals (no file names or note detail). Settings shows "X of Y used across N files" with a meter; the budget comes from `VITE_STORAGE_LIMIT_BYTES` (default 1 GiB) and is informational only.
- Bug found by the review pass and fixed: removing an inline image left `<img src="attachment:<uuid>">` behind, because the editor holds signed URLs and the URL map was cleared before the HTML was restored. Removal now restores refs first, then strips the node; covered by a unit test and rechecked in the browser.
- `sanitizeHtml` allows `attachment:` URIs (still strips `javascript:`) so saved notes survive a round trip.
- Tests: 281 Vitest tests across 34 files; 170 pgTAP assertions across 7 files; typecheck and production build green.
- Two-account acceptance (owner on `127.0.0.1:5173`, partner on `localhost:5173`): owner uploads an image and a text file (inline image plus cards); the stored body holds refs; a download returns 200 with `download=` disposition; read-only partner sees no upload/remove and a non-editable canvas; upgrading to edit reveals "Add files" and the partner uploads; the owner removes a file and the row and object both disappear; permanent note delete removes the note, its rows, and its objects; Settings reports the totals; consoles clean.
- Limit: signed URLs last an hour. The open note re-signs its images five minutes before expiry; a tab that stays open much longer keeps refreshing, one round per open note.

---

## 9. Phase 6 — Import and export

### Tasks

1. Single-note export: Markdown with front matter, HTML, optional zip with attachments.
2. Full-vault export: notebook folder tree, Markdown files, `attachments/<note-id>/`, `manifest.json`, `README.txt`.
3. JSON backup: full HTML bodies, notebooks, tags, metadata, attachment manifest.
4. Progress/cancel UI; batched attachment downloads; memory guardrails.
5. Joplin Markdown importer: folder → notebook tree, `.md` → note, `_resources` → attachments, link rewriting (`:/id` and relative), tags/timestamps when present.
6. Import preview and report; import root notebook; duplicate warning.
7. Sanitization of all imported HTML.

### Tests first

- Export fixtures: known vault → expected Markdown tree and manifest.
- Front matter and filename slug rules, including duplicates.
- Import fixtures: small Joplin Markdown export with images and links; assert notebooks, tags, attachments, and rewritten links.
- Sanitization test: scripts/event handlers stripped.
- Scope test: trashed notes excluded; owned archived included; shared-with-me excluded from full export.
- Large-export batching test with a synthetic attachment list.

### Definition of done

- A real Joplin Markdown export imports with notes, notebooks, attachments, and tags (or the documented fallback is implemented and recorded).
- The full export opens without Folio and contains every owned active/archived note and attachment.
- Export scope is exactly as specified; no silent omissions.
- Import report matches the report shown to the user.

### Progress (2026-10-28)

Stage 1 (pure modules) is done:

- The importer reads JEX rather than the Markdown export. JEX is a tar of Joplin's raw export (`<id>.md` items plus `resources/<id>.<ext>`), so titles, notebook parents, timestamps, and resource bytes survive exactly, with no SQLite/WASM step. `src/lib/tar.ts`, `joplin.ts`, `markdown.ts`, `frontmatter.ts`, `exportPaths.ts`, and `exportPlan.ts` cover the parse, HTML↔Markdown conversion, slugs, notebook folders, and the vault/single-note trees.
- Vault plan: owned active and archived notes, notebook folders mirror the tree, unfiled notes at the root, duplicate titles get `-2` suffixes, `manifest.json` + `README.txt`, empty notebooks listed in the manifest only. Trashed and shared-with-me notes are excluded and counted. Attachments land in `attachments/<note-id>/` and are linked relatively.

Stage 2 (data layer and hooks) is done:

- `src/db/export.ts` pages `note_summaries`, notebooks, and attachments; exposes `storagePaths`; and downloads attachment bytes through a worker pool (default 6 in flight) with progress and `AbortSignal`. The JSON backup planner returns full HTML bodies plus notebooks, tags, metadata, and the attachment manifest; share rows never appear.
- `src/db/import.ts` creates one dated root notebook (`Imported from Joplin — YYYY-MM-DD`), maps the notebook tree beneath it, restores note timestamps, pre-generates attachment ids so refs are rewritten before the note is saved, and strips a ref if its upload fails. Bad items become report entries instead of aborting the run; cancel returns a partial result.
- `0011_import_timestamps.sql` narrows `prepare_note`: INSERT keeps supplied timestamps, UPDATE still stamps `now()`. Covered by `import_timestamps_test.sql`.
- `useVaultExport` and `useJoplinImport` expose phase, counts, errors, preview/run/reset, and cancel; both pass the same signal down to the data layer.
- Tests: 400 Vitest tests across 45 files; 175 pgTAP assertions across 8 files; typecheck and build green.

Stage 3 (Settings UI) is done:

- Settings has separate Export and Import cards. Export offers the vault zip and the JSON backup with the phase named above a percentage progress bar and a Cancel button; Import opens a dialog that takes the `.jex` file, shows the preview counts, warnings, rewritten-link count, and a collapsible skipped list, then runs and reports notes/notebooks/attachments plus per-item failures.
- Both components are presentational: Settings owns `useVaultExport` and `useJoplinImport` and passes their controllers down, which keeps the component tests free of Supabase mocks. The dialog refuses to close while running (Cancel first) and a successful import refreshes the sidebar notebooks.
- A review pass pulled the shared running state into `ProgressMeter` (label, percentage, counts, cancel), the count wording into `formatCount` in `src/lib/format.ts`, and made the import report name the real dated root notebook instead of a hardcoded string.
- Tests: 412 Vitest tests across 47 files; typecheck and build green.

Stage 4 (browser acceptance with the real JEX) is done — Phase 6 complete:

- Imported `28_10_2026.jex` (964 KB) through Settings as `owner@folio.local`. Preview: 145 notes, 28 notebooks, 12 attachments, 12 links rewritten, no warnings, nothing skipped. Report: 145 notes, 29 notebooks (the dated root plus the tree), 12 attachments, no failures.
- Database check against the JEX: 145 notes, 29 notebooks with one root, 0 unfiled notes, 12 attachments totalling 515,804 bytes — byte-identical to the resource files in the archive. The notebook tree mirrors Joplin to five levels under `Imported from Joplin — 2026-10-28`.
- Timestamps: every note's `created_at`/`updated_at` matches Joplin's `created_time`/`updated_time` to the millisecond. The only differences are two titles that lost a leading/trailing space, which the database trims by design.
- The six empty note bodies are faithful: the same six notes are empty in Joplin (`People`, `Parceiros`, `Expenses`, `Senha das Finanças NIF`, `Kindness Playfullness and Respect`, `Sherish the past love the present and behold the future`).
- Inline images render in the editor through signed storage URLs (the `Contacts` image loads at 507 px wide), and the empty notes open with the placeholder and no console errors.
- Vault zip (`folio-export-2026-10-28.zip`, 831,908 bytes): 194 entries — README, manifest, 29 notebook folders, 145 Markdown files, and 12 attachments under `attachments/<note-id>/`. Relative image links resolve inside the archive, front matter carries the Joplin timestamps, and an empty note exports as front matter only.
- JSON backup (`folio-backup-2026-10-28.json`, 234,022 bytes): 145 notes with stored HTML, 29 notebooks, tags, and the attachment manifest; no share rows. Both counts match the manifest.

Next: Phase 7 (mobile/a11y polish, load test, hosted deploy).

---

## 10. Phase 7 — Polish and launch

### Tasks

1. Mobile pass on real iOS and Android browsers: install, safe areas, keyboard, toolbar, long lists, dialogs as sheets.
2. Accessibility pass: focus order, labels, contrast, reduced motion, keyboard-only use.
3. 5,000-note seed and performance checks; optimize queries/indexes if needed.
4. Dark/light/system theme finalization and design polish.
5. Hosted Supabase project: auth providers, redirect URLs, storage limits, migrations, backups.
6. Vercel production deploy with CSP headers, cache headers, PWA icons, and environment variables.
7. Two-account smoke test on production: owner creates/shares; partner reads/edits; exports work.
8. Verify the deployed bundle contains a new marker string; confirm the PWA loads.
9. Final docs update, including the shipped behavior and any deviations.

### Definition of done

- Every item in `SPEC.md` → "v1 definition of done" is checked.
- Production smoke test passes for both users on desktop and phone.
- Rollback path is known: previous Vercel deployment for the frontend; corrective migration for the database (forward-only).
- No secrets, live URLs, or project refs in public docs.

### Progress (2026-10-28)

The database and frontend are deployed; the two-account smoke test and the polish passes are still open.

Hosting preparation:

- `docs/DEPLOY.md` is the runbook: what the owner creates, where secrets live, the local gate, database-then-frontend order, production checks, rollback, and operations notes (Supabase test-only email limits, free-plan pause, storage meter).
- `scripts/apply-migrations.ps1` applies every migration in one transaction through a `postgres:17-alpine` container, reading `SUPABASE_DB_URL` from the gitignored `supabase/.env.prod.local`, refusing paths outside `supabase/migrations`, refusing a localhost host, and never printing the password. `-Verify` prints table, policy, and bucket counts. `-DryRun` lists the files without connecting. Kept as the fallback route.
- `vercel.json` carries `framework`, `buildCommand`, and `outputDirectory` for deterministic builds, plus the security and cache headers: CSP limited to self plus `*.supabase.co` (script, style, image, connect, worker), HSTS, `nosniff`, `frame-ancestors 'none'`, `noindex`, HTML `no-cache`, hashed assets immutable, service worker and manifest `no-cache`.
- The theme bootstrap moved from an inline script to `public/theme-init.js` so the strict CSP needs no `unsafe-inline` for scripts.

Database:

- The hosted project was linked from the CLI (`supabase login`, `supabase link`, `supabase db push`) rather than through the script, so no database password entered the chat. `supabase migration list --linked` reports all eleven migrations with local equal to remote.
- `supabase db dump` cannot run here (Docker Desktop off), so the schema was checked over the REST API instead: `notes`, `notebooks`, `attachments`, and `note_shares` all answer `401` with code `42501` to the anon key, which means the tables exist and RLS denies anonymous reads. Auth settings report email enabled and Google disabled.

Frontend:

- Vercel project created from the CLI; the Git integration was connected automatically and immediately disconnected, so `npm run deploy` remains the only path to production. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set for Production and Preview; the anon key is public by design and the secret key was never used.
- The first production deployment is READY and both stable aliases serve the app. Verified on the live origin: 200 with `<title>Folio</title>`, the strict CSP and the other headers exactly as configured, HTML `no-cache`, hashed assets immutable, `/sw.js` and the manifest `no-cache`, a deep route rewriting to the app shell, and the bundle containing the project URL and the anon key but no `service_role`.
- A real browser load of the production sign-in screen produced no console errors and no CSP violations.
- Vercel enables SSO deployment protection by default for team projects, and it intercepted `*.vercel.app` with Vercel's own login page. It was disabled for the project so the app is reachable without a Vercel account; preview deployments are therefore reachable too, which is acceptable because they are unlinked, `noindex`, and carry no data.

Still open:

- Supabase Site URL and redirect URLs must match the production origin exactly.
- The partner needs a sign-in route that is not the built-in test sender: Google OAuth or custom SMTP.
- Two-account production smoke test, both exports, and the PWA install on a phone.
- The five-item polish backlog above (done and deployed 2026-10-29; the
  production smoke test and phone PWA evidence still use the deployed app).
- **Regression from backlog item 3:** the collapsing note header made the
  mobile body flash and shake while scrolling and lost the reading position —
  see "Regression (2026-10-29)" below. **Fixed locally on 2026-10-29** (see
  "Fix" inside that section); the fix is green but still awaits `npm run deploy`,
  the phone check, and the keyboard-open check.
- Mobile and accessibility passes, and the 5,000-note load test.
- Custom domain and the final product name are undecided.

### Polish backlog (2026-10-28, from the owner's first real use on mobile)

All five items are done (2026-10-29). Outcome notes:

1. **Formatting toolbar compresses when the mobile keyboard opens.** The
   viewport meta now carries `interactive-widget=resizes-content`, and
   `.editor-header`, `.editor-meta-row`, and `.editor-toolbar` are pinned with
   `flex: 0 0 auto` (toolbar `min-height: 46px`), so only the note body shrinks
   when the keyboard appears. Phone widths still scroll the toolbar
   horizontally. `src/styles/editor.test.ts` guards all three rules plus the
   viewport meta.
2. **Inline images are too large.** `.tiptap img` is capped at
   `min(480px, 100%)`; tapping an image opens `ImageViewer` — a full-size
   lightbox where Escape, backdrop tap, image tap, and the close button all
   dismiss it, and focus moves to the dialog. `imageFromClick` in
   `src/lib/imageView.ts` only accepts images inside the note body, so
   attachment thumbnails and other UI images are unaffected.
3. **Collapsing note header.** `decideHeaderCollapse` in
   `src/lib/headerCollapse.ts` is a pure hysteresis rule (collapse below the
   fold while scrolling down, re-expand while scrolling up, never while focus
   sits inside the header); `useHeaderCollapse` drives it from the body's
   scroll events and resets per note. The collapsed state hides the header and
   meta rows; the toolbar stays pinned.
4. **Attachment bar collapsed.** `AttachmentArea` ships as a one-line
   "Attachments · n ▸" summary with `aria-expanded`/`aria-controls`; it expands
   on click, auto-expands while dragging files over it, and opens itself while
   an upload runs. Checked in both themes (tokens only, no hard-coded colors).
5. **Keystrokes vs. traffic.** `useAutosave` keeps a baseline of the last
   content known to be on the server — seeded by `reset(version,
   syncedContent)` when a note loads or refreshes, advanced on every
   successful save, dropped by any failed save. A flush whose snapshot equals
   the baseline skips the request entirely: no `save_note` and no list refetch,
   just an `unchanged` reducer event that reports "Saved" at the unchanged
   version and clears the local draft. Unknown baselines (new note, after a
   failed save) never skip, and version conflicts drop the baseline so the next
   flush always writes. Browser evidence: a reverted keystroke produced zero
   requests while the status still returned to "Saved"; a real edit produced
   exactly one `save_note`; a subsequent real edit still saved (no stuck
   state); a read-only partner opening a shared note generated no write
   attempts at all.

Two-account local run (owner on `localhost:5173`, partner on
`127.0.0.1:5173`): sharing read-only works, the partner sees the "Shared with
you by owner as read-only." banner with no formatting toolbar, and the owner's
note content round-trips byte-identically through the edit/undo cycle.

### Regression (2026-10-29, owner report): note body flashes and shakes while scrolling

Reported after the polish deploy, on the installed PWA: scrolling a note
"flashes/shakes", the scroll position is not stable, and it gets worse with the
keyboard open. Introduced by backlog item 3 (header collapse) and amplified by
item 1 (keyboard viewport) and item 4 (collapsible attachment bar). Live in
production from commit `5ddc22a`.

**Mechanism 1 — the toggle is smaller than the jump it causes (root cause).**
`decideHeaderCollapse` reacts to the *sign* of a single scroll delta: any
`delta > 0` collapses once past `HEADER_COLLAPSE_AFTER_PX = 80`, any
`delta < 0` expands. There is no distance threshold. Collapsing applies
`display: none` to `.editor-header` and `.editor-meta-row`, which are siblings
*above* `.editor-body` inside the `.editor-pane` flex column. Removing them
from layout moves the scroller's top edge up by their full height and grows it
by the same amount, while `scrollTop` is untouched — so the content under the
finger jumps up by H, and expands jump it back down by H. H is the wrapped
two-row phone header (back/title row plus the full-width action row, buttons
40 px at <= 860 px) plus the meta row: roughly 145 px on a phone and 105 px on
desktop (measure exactly first in the fix session). The trigger threshold (80
px) is therefore *smaller than the shift the trigger performs*, so touching the
boundary reverses a ~145 px content jump. Touch scrolling emits fractional,
bidirectional deltas (momentum tail, rubber-band, second finger, sub-pixel
rounding), so the sign flips several times per second and the body flashes up
and down. The header also cannot stay collapsed: one up-pixel expands it, one
down-pixel collapses it again.

**Mechanism 2 — layout-induced scroll events are read as user intent.**
`scrollTopRef` is the only memory of the previous position, so every synthetic
scroll event is scored as a gesture. Scroll anchoring (`overflow-anchor` is
never disabled) fires a compensating scroll event whenever the rows above the
scroller disappear or reappear, and that compensating delta is compared against
a stale ref. The same happens for anything else that changes the pane's inner
geometry: the keyboard resizing the layout viewport
(`interactive-widget=resizes-content`, item 1) animates over many frames and
clamps `scrollTop` on each one; the `AttachmentArea` summary opened mid-scroll
or an upload progress bar (item 4); a banner appearing (`NoteBanners`); the
caret-reveal scroll when tapping into the body. A keyboard open produces a run
of negative deltas (expand, +145 px) followed by positive ones (collapse,
-145 px): the "worse with the keyboard open" part of the report.

**Mechanism 3 — the tracker is seeded with a value that is not the container's.**
`reset()` sets `scrollTopRef.current = 0` without reading the real
`scrollTop` and without scrolling the body to the top. Switching notes while
scrolled down leaves the container at, say, 2000, so the next event reports a
phantom ±2000 delta. `src/hooks/useHeaderCollapse.test.ts` asserts this
zero-baseline behaviour, so the test currently encodes the bug.

**Blast radius.** During the flash the header holds the title input, the saved
status, and share/pin/archive/delete. Hiding and re-showing it also churns the
`role="status"` live region, and `display: none` can drop focus inside the
header — the guard reads `document.activeElement` before React applies the
class, so it is not a hard guarantee.

**Fix direction (needs owner sign-off before code).**

- A. Give the rule a deadband wider than the chrome and a travel threshold:
  collapse only above `HEADER_COLLAPSE_AFTER_PX + H` and expand only below
  `HEADER_COLLAPSE_AFTER_PX`, and require ~48 px of accumulated travel in one
  direction since the last toggle. Never toggle on a single event's sign.
- B. Make the tracker self-correcting: seed it from the real `scrollTop`
  (`reset(scrollTop)`), treat deltas larger than a plausible user step (~200 px)
  as layout-induced and re-seed on `visualViewport` resize, coalesce to one
  decision per animation frame, and ignore events for ~250 ms after a keyboard
  viewport change.
- C. Decide whether the collapse may change the scroller's height at all. Two
  options: (i) keep the rows outside the scroller in a fixed-height slot and
  only compact/fade their contents, so collapsing never moves content and can
  never emit phantom deltas — recommended for the phone; (ii) keep the space
  gain, animate the height with a CSS transition, and set
  `overflow-anchor: none` on `.editor-body` so the browser stops rewriting
  `scrollTop`.
- D. `overscroll-behavior: contain` on `.editor-body` so iOS rubber-band does
  not drag the document.
- E. If option (ii) wins, stop the phone header from wrapping to a second row
  (move pin/archive/share into an overflow menu) so H stays small.

**Failing tests to write first.**

- `src/lib/headerCollapse.test.ts`: ±1 px jitter across the boundary never
  toggles; alternating sub-threshold deltas keep the state; a 200 px downward
  scroll collapses exactly once; the shift caused by a toggle lands inside the
  deadband.
- `src/hooks/useHeaderCollapse.test.ts`: replace the zero-baseline `reset` test
  with one that seeds a real `scrollTop`; a 2000 px phantom delta after `reset`
  does not collapse; a `visualViewport` resize pauses toggling and then
  resumes; a scroll burst inside one frame yields one decision.
- `src/styles/editor.test.ts`: `.editor-body` carries `overscroll-behavior:
  contain`; the chrome slot keeps a constant height across both states (option
  i); the rows are not `display: none`.
- Browser acceptance (390x844 emulation plus a real phone): slow scroll across
  the suppressed boundary, fast fling, note switch while scrolled down,
  attachment bar opened mid-scroll, caret moved with the keyboard open — one
  toggle per deliberate direction change, reading position stable to the pixel,
  and `scrollTop` unchanged by the toggle itself.

**Acceptance evidence owed.** State-flip count per gesture recorded from the
console in both collapsed directions, with the keyboard closed and open, on the
installed PWA.

### Fix (2026-10-29): compensate the collapse, gate it behind real travel

Owner sign-off: keep the space gain (collapse still reclaims the rows), defer
the phone overflow menu (the header keeps wrapping to a two rows).

What changed:

- `src/lib/headerCollapse.ts` is a pure rule over `{ collapsed, baseline }`
  with four inputs: `scrollTop`, `delta` (movement between two events),
  `chromeHeight`, `headerHasFocus`. It collapses only when the position is past
  `expand line + chrome height + travel minimum` **and** at least 48 px of
  travel has accumulated since the last toggle; it expands on position alone
  below 80 px, so a collapsed header can never be stuck; a `|delta|` above
  200 px is layout, not a finger, and re-seeds instead of deciding; focus
  re-opens and re-seeds. `compensateScrollTop` scrolls by exactly the height
  the rows give back (`max(0, scrollTop + after - before)`).
- `useHeaderCollapse` coalesces scroll events into one decision per animation
  frame, measures the rows through the one selector the focus guard also uses,
  pauses decisions for 250 ms after a `window`/`visualViewport` resize, and — in
  a `useLayoutEffect`, before the frame is painted — pays the height change
  back on the scroller and re-seeds both trackers. `reset()` seeds from the
  container's real `scrollTop`, not from zero.
- `src/styles/editor.css`: `.editor-body` gains `overscroll-behavior: contain`
  and `overflow-anchor: none`, so the browser adds no scrolling of its own on
  top of the compensation.
- Accessibility: the save status is announced from a permanent `sr-only`
  `role="status"` region and the visible chip is `aria-hidden`, because
  `display: none` would drop it from the accessibility tree while collapsed.

Tests were written first and failed (23 red), then turned green:

- `src/lib/headerCollapse.test.ts` — 13 assertions: ±1 px jitter never toggles,
  sub-threshold movement holds the state, one toggle per deliberate push past
  the fold, the chrome height moves the fold, a jump between two events
  re-seeds, focus never hides the header, the compensated landing point sits
  inside the deadband.
- `src/hooks/useHeaderCollapse.test.ts` — 9: collapse hands the space to the
  scroller (`300 → 155` for a 145 px chrome), jitter holds, expand pays the
  height back (`70 → 215`), `reset` seeds from the real position (a 48 px move
  from 2000 collapses; measured from zero it would be swallowed), phantom jump
  ignored, viewport resize pauses then resumes, one decision per frame burst,
  focus guard, frame cancelled on unmount.
- `src/styles/editor.test.ts` — `overscroll-behavior: contain`,
  `overflow-anchor: none`, and the collapse rule still present.

Full suite: **460 tests / 52 files green**, `npm run typecheck` and
`npm run build` green.

Browser acceptance (local stack, desktop viewport — the in-app browser has no
viewport emulation):

| Check | Result |
| --- | --- |
| 22,000-char note, chrome 174 px, fold 302 px, scripted down-and-up scroll sampled every frame | max deviation of the first paragraph's screen position from "only what the script scrolled": **0.8 px**; state flips: **exactly 1 collapse + 1 expand**; at the collapse frame `scrollTop` went 320 → 186.4 (= −174, exactly the chrome) while the text did not move |
| 60 one-pixel oscillations straddling the fold | **exactly 1 flip** total, deviation ~0 — the old rule flipped on every pixel |
| Note switch while scrolled down and collapsed | header reopens, tracker seeded from the container, a 100 px nudge afterwards does **not** collapse |
| Console | no errors |

Still owed for this fix: the phone-width run (390×844 wrap, ~145 px chrome) and
the keyboard-open run on a real device **after** `npm run deploy`, plus the
installed-PWA check.



---

## 11. Test strategy

| Level | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest | Pure logic, state machines, query builders, import/export transforms, validation |
| Database access | pgTAP via `npx supabase test db` | RLS matrix, RPC behavior, triggers, constraints, search |
| Integration | Supabase JS against local stack | Storage signed URLs, realtime subscription behavior where useful |
| End-to-end | Optional Playwright | Sign in, create/edit, share, partner edit; only if it stays stable |
| Manual | Two browsers + one phone | Sharing, conflict banner, PWA install, mobile editing, export download |

Rules:

- Tests never run against the hosted database or production data.
- Seed data is local-only and generated by a script; the real Joplin export is never committed.
- Every bug fix starts with a failing test when practical.
- Access-control tests are mandatory and are not replaced by UI tests.

---

## 12. Deployment runbook

1. **Create the Supabase project** (owner action). Prefer a separate project from ExpenseTracker. Record the project URL and publishable key in a private env file only.
2. **Configure auth:** Google provider credentials, redirect URLs for localhost and the production domain, magic-link email template, site URL.
3. **Add the guarded migration script** (`scripts/apply-migration.ps1` pattern): one file, one transaction, refuses non-migration paths, reads `supabase/.env.prod.local`, never prints passwords.
4. **Validate locally:** `npx supabase start`, `npx supabase db reset`, `npx supabase test db`, `npm run test`, `npm run typecheck`, `npm run build`.
5. **Apply hosted migrations** in numeric order with the guarded script. The database goes live before the frontend.
6. **Deploy the frontend:** `npm run deploy` (`vercel --prod`). Keep the Vercel Git integration disconnected.
7. **Verify:** fetch the production asset containing the build marker; complete the two-account smoke test; install the PWA on a phone.
8. **Record** the deployment in private notes. Do not add the live URL, project ref, keys, or team slug to public docs.

Rollback:

- Frontend: promote the previous Vercel deployment.
- Database: migrations are forward-only. Write and test a corrective migration locally, then apply it; never hand-edit hosted data for schema rollback.

Never run the app's destructive RPCs or bulk imports against the hosted database.

---

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Joplin Markdown export loses notebook/tag hierarchy | Migration incomplete | Test with the real export early in Phase 6; per-notebook export instructions or a JEX parser fallback |
| HTML → Markdown export loses formatting | Lock-in worry | Fixture tests; always export HTML and JSON alongside Markdown; document limitations |
| TipTap is awkward on mobile keyboards | Core UX failure | Test on real phones during Phase 3, not only Phase 7; keep the toolbar compact and sticky |
| Conflict UX is confusing | Data loss or frustration | Version-checked saves, banner with explicit choices, no silent overwrite, tests for each state |
| Large exports exhaust browser memory | Export failure | Batch downloads, progress/cancel, stream where possible; server-side export later if needed |
| Supabase Free storage fills up | Upload failures | Show usage, document limits, plan Pro or external storage before it becomes urgent |
| Magic-link email rate limits | Login friction | Google OAuth as primary path; custom SMTP only if needed |
| Open signup abuse | Noise, account lookup exposure | RLS isolation; invite-only signup can replace open signup later |
| Scope creep toward Notion | Delays, complexity | Non-goals in the spec; require an explicit decision to expand scope |
| Security regression in sharing | Private notes exposed | pgTAP access matrix is a release gate; review every new policy |
| Mistake in hosted configuration | Downtime or exposure | Runbook checklist; verify migrations and auth redirects before the frontend deploy |

---

## 14. Open items blocking or shaping phases

| Item | Needed by | Default if not answered |
| --- | --- | --- |
| Final name | Phase 7 deploy | "Folio" |
| Google OAuth credentials | Phase 1 completion / Phase 7 | Magic-link-only until supplied |
| Separate Supabase project | Phase 7 (local works before) | Separate project |
| Real Joplin Markdown export | Phase 6 | Build against a sanitized fixture; validate later |
| English-only UI vs i18n | Phase 1 | English-only, strings centralized |
| Attachment limit and storage budget | Phase 5 | 20 MB per file, Supabase Free limits |
| Restore-from-backup priority | After v1 | Not in v1; format documented |

---

## 15. Handoff convention

When a session ends mid-phase:

- Update the status table and any completed checklist items here.
- Update `AGENTS.md` status and open items.
- Leave a short handoff note covering: what changed, what is green, what is red, the next concrete action, and any environment setup needed.
- Do not leave uncommitted secrets, scratch SQL, or experimental files in the tree.
