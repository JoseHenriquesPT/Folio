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
- Next action: start Phase 6 (Joplin import and export/backup). Google OAuth credentials are still open but do not block Phase 6.
- Local Supabase and Docker are required for pgTAP and the browser acceptance runs. `npx supabase db reset` clears local test users and seeded notes; recreate two accounts through Mailpit before re-running the share checks.

## Handoff — end of Phase 5

- Changed: attachment upload/sign/cleanup stack (`src/lib/attachments.ts`, `src/db/attachments.ts`, `useNoteAttachments`, `useAttachmentActions`, `AttachmentArea`), the `0010_attachment_usage.sql` RPC, the Settings storage card, and tag state moved to `useNoteTags`.
- Green: `npm test` (281), `npm run typecheck`, `npm run build`, `npx supabase test db` (170), and the two-account attachment acceptance run in the browser.
- Red: nothing known. Phase 4 and Phase 5 are still uncommitted; ask before committing.
- Next action: start Phase 6 by writing the failing parser test for a real Joplin Markdown export, then the note/vault export writers.
- Setup: local Supabase is running; `owner@folio.local` and `partner@folio.local` exist in Mailpit (`http://127.0.0.1:54324`); the local vault is empty, so create a note before testing attachments.

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
- Deploy the database before the frontend. Validate migrations locally, then apply to hosted with a guarded, single-transaction script.
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
- Obtain one real Joplin Markdown export before Phase 6.
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
