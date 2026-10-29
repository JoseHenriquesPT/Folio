# Folio — agent guide

Read this file first, then `docs/SPEC.md` (what v1 must be) and `docs/PLAN.md` (how it gets built). Work through the plan in order; do not start a later phase without agreeing with the owner.

## Status

- Phase 0 — project definition and docs: **done**.
- Phase 1 — scaffold and auth: **implemented**. Magic-link sign-in is verified end to end; Google OAuth is wired but needs provider credentials.
- Phase 2 — database and access control: **done**. Six migrations, RLS on every user table, the private attachment bucket, 140 pgTAP assertions, and a typed data layer with 106 Vitest tests. See the Phase 2 outcome in `docs/PLAN.md`.
- Phase 3 — notes experience: **done**. Three-pane workspace, TipTap editor, autosave/drafts/conflicts, notebook/tag management, search/command palette, trash/archive, and 5,000-note performance checks. 178 Vitest tests and 158 pgTAP assertions. See the Phase 3 outcome in `docs/PLAN.md`.
- Phase 4 — sharing and realtime: **done**. Share dialog with exact-email lookup, read/edit permissions and revoke; share badges on cards and in the editor; per-note and workspace realtime refresh; conflict and access-lost banners. 224 Vitest tests and 164 pgTAP assertions, plus a two-account browser acceptance run. See the Phase 4 outcome in `docs/PLAN.md`.
- Phase 5 — attachments and inline images: **done**. Private bucket uploads (picker, drop, paste), inline images stored as `attachment:` refs and resolved to one-hour signed URLs, file cards with download disposition, owner-only delete, cleanup on permanent note deletion, and a storage-usage card in Settings. 281 Vitest tests and 170 pgTAP assertions, plus a two-account browser acceptance run. See the Phase 5 outcome in `docs/PLAN.md`.
- Application code exists. No hosted Supabase project or Vercel deployment exists yet.
- Working name: **Folio**. Rename before the first deploy if desired.
- This is a separate repository and deployment from ExpenseTracker. Never modify ExpenseTracker from here.
- Phase 6 — import and export: **done**. Pure modules (JEX reader, importer, HTML↔Markdown, front matter, export planners), the export/import data layer, JSON backup, timestamp migration, hooks, and the Settings UI. Acceptance run with the real 145-note Joplin vault passed: timestamps, notebook tree, attachments, inline images, vault zip, and JSON backup all verified. See the Phase 6 outcome in `docs/PLAN.md`.
- Phase 7 — polish and launch: **in progress, deployed**. The hosted database has all eleven migrations (applied from the CLI; `supabase migration list --linked` shows local equal to remote) and the frontend is live on Vercel from `npm run deploy`. Google OAuth is enabled and the owner confirmed sign-in works on production. The five-item polish backlog is done locally (see the handoff below). Still open: the two-account production smoke test evidence, both exports and the PWA install on a phone, mobile/a11y polish, and the 5,000-note load test. `docs/DEPLOY.md` is the runbook.
- Local Supabase and Docker are required for pgTAP and the browser acceptance runs. `npx supabase db reset` clears local test users and seeded notes; recreate two accounts through Mailpit before re-running the share checks.

## Handoff — Phase 7, polish backlog done

- Changed: all five items from `docs/PLAN.md` → "Polish backlog" are implemented and browser-verified. Item 1: `interactive-widget=resizes-content` in `index.html` plus `flex: 0 0 auto`/`min-height` on header, meta row, and toolbar. Item 2: `.tiptap img` capped at `min(480px, 100%)`, new `src/components/ImageViewer.tsx` lightbox, `src/lib/imageView.ts` click resolver. Item 3: `src/lib/headerCollapse.ts` pure rule + `src/hooks/useHeaderCollapse.ts`, collapsed class hides header/meta rows. Item 4: `AttachmentArea` collapsed to a one-line `aria-expanded` summary that expands on click/drag/upload. Item 5: `useAutosave` baseline + no-op flush skip (`unchanged` reducer event; baseline seeded by `reset(version, syncedContent)`, dropped on any failed save), with `onUnchanged` in NoteEditor clearing the draft without refetching the list.
- Also changed: `vitest.config.ts` sets `css: true` so tests can read stylesheets with `?raw` (`src/styles/editor.test.ts` guards the CSS/viewport rules); banner JSX moved out of the 1,040-line `NoteEditor.tsx` into `NoteBanners.tsx` plus the `useHeaderCollapse` extraction — `NoteEditor.tsx` is back to 985 lines (the review skill's ~1,000-line threshold was the reason).
- Green: `npm test` (447 tests, 52 files), `npm run typecheck`, `npm run build`.
- Red: `npx supabase test db` fails 6/175 assertions in `attachment_usage_test.sql` (1-3) and `search_test.sql` (5, 9, 11) — pre-existing data pollution from the Phase 6 JEX import, not this session (no SQL changed). Arithmetic proof: the tests expect the fixture's 2 attachments/3,500 bytes but see 14/519,304 = fixture + the import's 12/515,804 exactly; the search counts pick up imported recipe notes ("basil", "tomato"). Owner chose to leave local data intact rather than `npx supabase db reset`; the suite passes on a clean database (175 green at Phase 6). If a future session resets, re-run pgTAP to confirm green, then recreate the two accounts through Mailpit.
- Acceptance evidence (local two accounts): reverted keystroke → 0 requests and status returns to "Saved"; real edit → exactly 1 `save_note`; edit after a skipped no-op still saves; read-only partner sees the shared note with banner, no toolbar, no writes; header collapse/expand on scroll verified live; image cap + lightbox + Escape verified; attachment summary "ATTACHMENTS 4 ▸" expand/collapse verified; note content byte-identical after the edit/undo test cycle (test characters removed).
- Next action: Phase 7 remainder — two-account production smoke test, both exports from Settings, PWA install on a phone, then mobile/a11y passes and the 5,000-note load test. Update the status above when evidence lands; do not start a new phase without agreeing with the owner.
- Decisions taken: no-op save compares against a baseline that any failed save invalidates (never assume unknown content matches); lightbox closes on any tap including the image itself; header never hides while focus is inside it; `NoteBanners` is presentational (status flags in, banners out).
- Environment: `npx supabase start` was already running; a second Vite dev server (`npx vite --host 127.0.0.1 --port 5173`) gives the partner origin its own localStorage — the primary server binds only `::1`. Two accounts exist locally: `owner@folio.local` and `partner@folio.local` (created through Mailpit).

## Handoff — Phase 7, polish backlog

- Status: hosted Supabase linked and migrated (all 11 files, `migration list --linked` shows local equal to remote), frontend deployed from `npm run deploy`, GitHub integration disconnected, SSO deployment protection disabled so `*.vercel.app` is reachable without a Vercel account. Production origin, headers, bundle (public key only, no `service_role`), SPA rewrite, and a clean console are all verified. Google OAuth is enabled and the owner confirmed sign-in works.
- The backlog itself lives in `docs/PLAN.md` → "Polish backlog (2026-10-28)", five items, none started, in priority order:
  1. mobile formatting toolbar compresses when the keyboard opens;
  2. inline images too large — cap the default width, tap to expand;
  3. collapse the title/saved/tags header on scroll, keep only the editor toolbar pinned;
  4. collapse the attachment bar to a one-line summary that expands on click;
  5. prove shared notes do not turn keystrokes into traffic — autosave already debounces 800 ms with one in-flight save and realtime is refresh-only, so this is measurement plus a no-op-save guard, not a rewrite.
- Started but not finished in that session: none. No code changed after commit `bacd48e`.
- Evidence still owed: the two-account smoke test (create → attach → share read-only → partner reads → partner edits), both exports from Settings, PWA install on a phone, and the service-worker update after a second deploy.
- Next action: agree an order for the five backlog items with the owner, then work them one at a time — failing test first, green `npm test` / `typecheck` / `build`, then commit.

## Handoff — Phase 6, stage 4

- Changed in stage 3: `src/components/ExportPanel.tsx` (vault zip / JSON buttons, progress, Cancel) and `src/components/JoplinImportDialog.tsx` (file picker, preview, run, report), both presentational with the hook controllers passed in; Settings gained separate Export and Import cards and refreshes notebooks after a successful import.
- Changed in stage 4: the shared running state moved to `src/components/ProgressMeter.tsx`; count wording moved to `formatCount` in `src/lib/format.ts` (`formatNoteCount` delegates); `ImportResult` now carries `rootNotebookName`, which the report prints instead of a hardcoded notebook name.
- Green: `npm test` (412, 47 files), `npm run typecheck`, `npm run build`, `npx supabase test db` (175 assertions, unchanged since stage 2).
- Red: nothing known.
- Acceptance evidence: import of `28_10_2026.jex` gave 145 notes, 29 notebooks (dated root plus the 28-note tree), 12 attachments (515,804 bytes, equal to the JEX resources), 0 unfiled, 0 failures. Every note's created/updated timestamp matches Joplin to the millisecond; the six empty bodies are empty in Joplin too. Exports: `folio-export-2026-10-28.zip` (194 entries, 145 Markdown files, 12 attachments, manifest, README, relative image links resolve) and `folio-backup-2026-10-28.json` (145 notes with stored HTML, no share rows).
- Next action: Phase 7 — mobile/a11y polish, load test, then the hosted Supabase project and the first `npm run deploy`. Agree the phase plan with the owner before starting.
- Decisions taken: import keeps the dialog open until Done and blocks closing while running (Cancel first); a successful import refreshes the sidebar notebooks; export progress is a percentage of attachments with the phase named above it.

## What this is

A private notes app for the owner and their partner. The owner keeps a large personal vault; selected notes are shared per note, either read-only or editable. Web app plus installable PWA.

## Product guardrails (do not weaken without agreement)

1. Per-note sharing only (`read` or `edit`), owner controlled. No workspace-wide sharing.
2. Private by default. No public links in v1.
3. The server is the source of truth. No device-to-device sync and no "sync folder" concept.
4. Portability is a feature: every note exports to Markdown/HTML, the vault exports to a zip with attachments and a manifest, plus a full JSON backup.
5. Mobile and desktop are both first-class: responsive from 320px, installable PWA.
6. Simple on the surface. No Notion-style blocks, databases, formulas, or workspace nesting.
7. No live co-editing/CRDT in v1. Version-checked autosave, realtime refresh, and a conflict banner.
8. No offline editing in v1. The app shell and local drafts survive reloads; saves need connectivity.
9. All access is enforced in the database (RLS, storage policies, and security-definer RPCs), not merely hidden in the UI.
10. Attachments are private. Never use a public bucket.

## Decided stack

- Frontend: Vite, React 18, TypeScript (strict), React Router, plain CSS with design tokens.
- Editor: TipTap/ProseMirror, free extensions only, Markdown input rules.
- Backend: Supabase (new, separate project) — Postgres, Auth, Storage, Realtime.
- Auth: Google OAuth plus email magic link, matching ExpenseTracker.
- Hosting: Vercel, manual production deploys.
- Tests: Vitest for TypeScript; pgTAP SQL tests for access rules (`npx supabase test db`).
- Import/export: Turndown, JSZip, marked, DOMPurify.

## Repository conventions

- `src/db/` — typed Supabase access. No UI imports here.
- `src/lib/` — pure logic, with a colocated test (`x.ts` / `x.test.ts`).
- `src/hooks/` — React hooks that combine the data layer with component state.
- `src/components/`, `src/pages/` — UI, one component per file.
- `src/styles/` — design tokens, app shell, workspace, and editor styles.
- `scripts/` — local-only utilities such as the seeded-vault generator.
- `supabase/migrations/NNNN_name.sql` — ordered, forward-only migrations.
- `supabase/tests/*.sql` — pgTAP access-control tests.
- Keep files small and focused. No commented-out code. No `any` without a written reason.
- The note body is stored as sanitized HTML (`body_html`); the database derives plain text and the search vector.
- Auth uses PKCE. Do not switch it to implicit flow.
- Local magic-link emails are read in Mailpit at `http://127.0.0.1:54324`.
- UI language is English unless the owner asks for i18n.

## Workflow rules

- Write the failing test first for every behaviour: unit tests for TypeScript, pgTAP for access rules.
- Plan multi-step work and get approval before editing files.
- Apply migrations locally first: `npx supabase start`, `npx supabase db reset`, then `npx supabase test db`.
- Update `docs/PLAN.md` status when a phase completes, including anything learned.
- After every code edit, state in one plain sentence what changed and why.
- Never commit secrets. `.env.local`, `supabase/.env*.local`, and `.vercel` are gitignored.
- Ask before committing or pushing. Never commit unless asked.
- At the end of a task that leaves work for the next session, leave a short handoff note and update the status section here.

## Security and deployment

- RLS enabled on every table containing user data. Test owner, editor, reader, and stranger for every path.
- No service-role key in the browser. Only the publishable/anon key; RLS does the work.
- Content saves go through a version-checked `save_note` RPC. Editors cannot touch notebooks, share rows, pin/archive/delete state, tags, or attachment records.
- Sanitize imported or generated HTML before rendering.
- Deploy the database before the frontend. Validate migrations locally, then apply to hosted with `scripts/apply-migrations.ps1`; the full sequence is in `docs/DEPLOY.md`.
- Keep the Vercel Git integration disconnected. Deploy with `npm run deploy` (`vercel --prod`).
- After deploying, verify the production bundle contains a new marker string.
- Never publish the live URL, Supabase project ref, keys, or team slug in public docs.

## Commands

```text
npm install
npm run dev
npm run test
npm run typecheck
npm run build
npm run deploy
npx supabase start
npx supabase status
npx supabase db reset
npx supabase test db
```

`.npmrc` sets `legacy-peer-deps` because npm 10.9 mis-resolves Vitest 4's optional browser providers. Do not remove it without confirming `npm install` works on the current npm.

Do not invent scripts that are not in `package.json`; add them with tests.

## Phase map

| Phase | Outcome |
| --- | --- |
| 1 | Scaffold, auth, app shell, PWA skeleton |
| 2 | Schema, RLS, pgTAP access matrix, typed data layer |
| 3 | Notes, notebooks, tags, editor, search, card/list UI |
| 4 | Sharing and realtime |
| 5 | Attachments and inline images |
| 6 | Joplin import and full export/backup |
| 7 | Mobile/a11y polish, load test, hosted deploy |

Detailed tasks and definitions of done are in `docs/PLAN.md`.

## Open items

- Confirm the name "Folio" before the first deploy.
- Provide Google OAuth client credentials for local sign-in, or accept magic-link-only for now. Hosted Google is configured in the Supabase dashboard.
- Create the separate Supabase project (recommended). Fallback: a `notes` schema in the existing ExpenseTracker project.
- Joplin export obtained: `28_10_2026.jex` (145 notes, 28 notebooks, 12 images, no tags). Keep it out of the repository; the committed fixture is synthetic.
- Decide whether the UI ships English-only (current default) or with i18n from the start.
- Confirm the 20 MB per-file attachment limit and the storage budget.

## Definition of done

See `docs/SPEC.md` → "v1 definition of done". A phase is complete only when its tests pass, the build passes, and `docs/PLAN.md` is updated.

<!-- BEGIN development-floor -->
# Guidelines

- Write tests before building the implementation.
- For complex or multi-step work, plan first and get the plan approved before making changes. Keep it lightweight for trivial single-step requests.
- Start a new task in a new session — don't let unrelated work pile up in one conversation. When a task ends with knowledge the next task needs, leave a short handoff note (the `handoff` skill writes one).
- Before wrapping up a session that created or edited code, run the changes through the `thermo-nuclear-code-quality-review` skill; resolve its findings, and only then build the handoff.
- After every code write/edit, say in one short, plain-language sentence what changed and why — as if explaining it to a non-technical person.

# Reference

Available tooling reference: [docs/KNOWLEDGE.md](docs/KNOWLEDGE.md) — capabilities worth reaching for (task delegation, worktrees, lifecycle hooks, repeated runs, side questions, remote sessions) and how to find them in your harness. Consult it when a task looks like it needs one; it isn't loaded by default.
<!-- END development-floor -->
