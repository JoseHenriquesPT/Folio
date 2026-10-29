# Folio — agent guide

Read this file first, then `docs/SPEC.md` (what v1 must be) and `docs/PLAN.md` (how it gets built). Work through the plan in order; do not start a later phase without agreeing with the owner.

## Status

- Phase 0 — project definition and docs: **done**.
- Phase 1 — scaffold and auth: **implemented**. Magic-link sign-in is verified end to end; Google OAuth is wired but needs provider credentials.
- Phase 2 — database and access control: **done**. Six migrations, RLS on every user table, the private attachment bucket, 140 pgTAP assertions, and a typed data layer with 106 Vitest tests. See the Phase 2 outcome in `docs/PLAN.md`.
- Phase 3 — notes experience: **done**. Three-pane workspace, TipTap editor, autosave/drafts/conflicts, notebook/tag management, search/command palette, trash/archive, and 5,000-note performance checks. 178 Vitest tests and 158 pgTAP assertions. See the Phase 3 outcome in `docs/PLAN.md`.
- Phase 4 — sharing and realtime: **done**. Share dialog with exact-email lookup, read/edit permissions and revoke; share badges on cards and in the editor; per-note and workspace realtime refresh; conflict and access-lost banners. 224 Vitest tests and 164 pgTAP assertions, plus a two-account browser acceptance run. See the Phase 4 outcome in `docs/PLAN.md`.
- Phase 5 — attachments and inline images: **done**. Private bucket uploads (picker, drop, paste), inline images stored as `attachment:` refs and resolved to one-hour signed URLs, file cards with download disposition, owner-only delete, cleanup on permanent note deletion, and a storage-usage card in Settings. 281 Vitest tests and 170 pgTAP assertions, plus a two-account browser acceptance run. See the Phase 5 outcome in `docs/PLAN.md`.
- Application code exists. **A hosted Supabase project and a Vercel deployment exist, and the hosted database holds live owner data** (see the status line and handoff below). Treat it as a real user's private notes: destructive SQL, resets and seeding are local-only.
- Working name: **Folio**. Rename before the first deploy if desired.
- This is a separate repository and deployment from ExpenseTracker. Never modify ExpenseTracker from here.
- Phase 6 — import and export: **done**. Pure modules (JEX reader, importer, HTML↔Markdown, front matter, export planners), the export/import data layer, JSON backup, timestamp migration, hooks, and the Settings UI. Acceptance run with the real 145-note Joplin vault passed: timestamps, notebook tree, attachments, inline images, vault zip, and JSON backup all verified. See the Phase 6 outcome in `docs/PLAN.md`.
- Phase 7 — polish and launch: **in progress, deployed**. The hosted database has all eleven migrations (applied from the CLI; `supabase migration list --linked` shows local equal to remote) and the frontend is live on Vercel from `npm run deploy`. Google OAuth is enabled and the owner confirmed sign-in works on production. The five-item polish backlog is done and deployed (see the handoffs below), and the scrolling regression it shipped is **fixed and deployed** (2026-10-29 — see "Handoff — Phase 7, scrolling regression fixed"; the served bundle was verified to carry the new CSS). Still open: the phone and keyboard-open checks for that fix on the installed PWA, the two-account production smoke test evidence, both exports and the PWA install on a phone, mobile/a11y polish, and the 5,000-note load test. `docs/DEPLOY.md` is the runbook.
- **App-like interaction pass (2026-10-29): done and deployed.** Folio now draws its own confirmation and link dialogs (a guard test keeps `window.confirm`/`window.prompt` out of `src`), the browser's long-press/right-click box is suppressed app-wide while inputs, the editor, images and Shift keep it, note cards open Folio's own action menu, and a held card can be dragged onto a notebook or tag in the sidebar. Frontend-only, no SQL; 545 Vitest tests; see the handoff below.
- Local Supabase and Docker are required for pgTAP and the browser acceptance runs. `npx supabase db reset` clears local test users and seeded notes; recreate two accounts through Mailpit before re-running the share checks.
- **Production data is live owner data (since 2026-10-29).** The owner imported their real Joplin vault into their own account on the hosted project: 145 notes, 28 notebooks (tree at top level), 12 attachments, 0 unfiled. Everything below and any future hosted change assumes those are private notes belonging to the owner.

## Handoff — Phase 7, app-like interaction pass (2026-10-29)

- Owner's ask: long-pressing cards and deleting things popped the browser's own boxes; make it prettier and app-like. Decisions taken up front: a styled confirm dialog with a danger button (no type-to-confirm), a real Folio card menu rather than suppress-only, the phone's drop targets come from auto-opening the sidebar drawer, a tag drop toggles, and the menu carries "Move to notebook…" as the keyboard/screen-reader route.
- Changed (frontend only, **no SQL, no migration**):
  - `src/lib/confirm.ts` (the `ConfirmOptions` shape plus the shared TRASH/DELETE copy) and `components/ConfirmProvider` — one queued styled alert dialog replacing all six `window.confirm` sites; focus lands on **Cancel** for destructive tone. `LinkDialog` + `src/lib/linkUrl.ts` replace `window.prompt` for links. `src/lib/noNativeDialogs.test.ts` scans `src` (excluding `*.test.*`) so neither can come back.
  - Native menu suppression: `src/lib/contextMenu.ts` (rule over target + Shift) behind `useContextMenuSuppress` in AppShell; editable fields, `.ProseMirror`, images and Shift keep the native menu. CSS `-webkit-touch-callout: none` on `.note-card`/`.sidebar-link` for iOS, guarded by `src/styles/interactions.test.ts`; the shared `cssRule` helper moved to `src/test/cssRule.ts`.
  - Card menu: `src/lib/noteMenu.ts` (items, incl. Move to notebook…), `src/hooks/useLongPress.ts` (one gesture: press → lift → drag → release; swallows the compatibility mouse events after a lift so nothing navigates or closes the menu; claims `touchmove` only while lifted so lists still scroll), `src/hooks/useNoteDrag.ts` (imperative ghost, `.drop-target` ring, phone drawer), `components/NoteActionMenu` (`request: {note, anchor, items} | null`, arrow keys, Escape, focus returns to the card, close-once guard), `useNoteActions.run` for the actions, `MoveNoteDialog` picker, `src/lib/menuPosition.ts` for edge clamping.
  - Drag: `src/lib/dragNote.ts` (`dropTargetFrom`, `planDrop`, `UNFILED_ID`), sidebar rows carry `data-drop-kind/id/label`, `SidebarDrawerContext` (AppShell wraps the Outlet), `useNoteActions.applyDrop` (move / tag add / tag remove, with `onTagsChanged` for sidebar counts), CSS for `.note-ghost`, `.note-card.dragging`, `.sidebar-link.drop-target`.
- Gates: **545 tests / 66 files, typecheck, build** — green. `npx supabase test db` not run (no SQL changed; still the known 6/175 Phase 6 pollution). Every module's suite was written first and red before its implementation.
- Browser acceptance (local, `owner@folio.local`, dev server on **port 5174**; refs from snapshots need `depth: 20` or the cards are below the default depth): right-click card → menu `Actions for …` with a probe showing `defaultPrevented: true`; right-click in the search box → `false`; **Shift+right-click on a card → `false` and no menu**; hold 650 ms → ghost + dim → release → menu + full cleanup; hold-drag onto a row → ring → toast "Moved to Unfiled." → REST `notebook_id` null → dragged back → `deleted_at`/notebook byte-exact as found; drop on an off-screen row → correctly nothing; picker move and move back; trash dialog (`role="alertdialog"`, focus on Cancel, `.button.danger`, `browser.dialog get` → null) → Cancel = no change → Confirm → REST `deleted_at` set → trash menu (Open / Restore / Delete permanently) → Restore → `deleted_at` null + toast; link dialog (input focused, Escape closes); console clean throughout.
- Two defects acceptance found, both fixed in `c05a8d7`: the card's own `onContextMenu` ignored Shift (the window rule honoured it, the card didn't), and a hold-then-release never cancelled the lift it had created (ghost/dim left behind).
- Review pass (thermo-nuclear) resolved: `onActions`/`onDrop` are required props (killed three dead branches and the duplicate "none" check), `NoteActionMenu` takes a single `request` (removed the `EMPTY_ANCHOR` sentinel), `useNoteDrag` takes `drawerOpen` + `onDrawerOpenChange` (no components import from hooks). Considered and rejected: ConfirmProvider reusing `Modal` (would need new props for the role, no-× and button focus; the structures genuinely differ), extracting the workspace's menu glue into a hook (relocates glue instead of removing complexity; 390 lines is far under the trigger). **Flagged: `NoteEditor.tsx` is at 994 of the ~1,000-line threshold** after both sessions' edits — decompose it before the next change there. `note-menu-item` styling is shared by the picker's rows (one visual row, two placements).
- Owed: the phone-width run (drawer auto-open during a drag, iOS callout, touch drag feel) — the in-app browser cannot emulate a phone width; two-account checks for shared notes (a shared note correctly gets no menu — unit-tested only); the Delete-permanently dialog was opened live only as far as Cancel (its path is the same verified ConfirmProvider with unit coverage); no screenshot (desktop window not visible during the run).
- **Deployed 2026-10-29** on the owner's instruction ("Deploy now anyway"): `npm run deploy` → READY, aliased `folio-ten-mauve.vercel.app`. Served-bundle verification afterwards: main chunk carries `Actions for `, `note-ghost` and `Move to notebook`; the CSS carries `note-ghost` and `touch-callout`; **no `service_role` in any chunk**; viewport marker intact; HTML `no-cache`; the live origin renders the sign-in screen with a clean console. This deploy **also shipped the parallel session's removal of `headerCollapse`/`useHeaderCollapse`** (their `useKeyboardOpen` work is live too, `header-collapsed` is gone from the served JS/CSS) — so the phone and keyboard-open checks now cover two changes at once and are the next thing to run on the device.
- Environment: local Supabase running; **two dev servers** — `localhost:5173` (the parallel session's; its Vite module cache went stale mid-session, so a restart is what picks up current source) and `localhost:5174` (this session, background shell `sh_189343a5d001EKi5zxotNlmFhx`). Browser tab open on 5174 with a card menu left open for viewing, plus a tab on the live origin. The local test note "Morada" was moved, trashed and restored during acceptance and is back at `deleted_at: null`, notebook "Miscellaneous & Practical". Pushed: `a3a8205`, `c05a8d7`, `f6a479a`, and this docs commit.

## Handoff — Phase 7, production now holds the real vault (2026-10-29)

- Done: the owner imported `28_10_2026.jex` through Settings → Import while signed in on production, then removed the import wrapper. `Imported from Joplin — 2026-10-29` was deleted from Manage notebooks; `parent_id … on delete set null` (migration `0002_notebooks_tags.sql`) promoted its 28 children to top level. No code changed, nothing to test or commit.
- Verified on the live origin: **145 notes** (list paged to `hasMore` false), **Unfiled 0**, wrapper absent from the sidebar, hierarchy identical to Joplin — 6 roots (A Notebook, Ideas, Learning, Projects, Tasks/Shopping & Expenses, Writing Tips and Guidelines for AI), children at level 1, grandchildren intact (Essays still under Creative Writing), 12 attachments untouched.
- Recipe if a future import leaves a dated wrapper behind: check **Unfiled** and the wrapper's own note count first — `src/db/import.ts` files any note whose notebook is missing (or has none) *into* the wrapper, so it is only safe to delete when it holds no notes. Then delete it and re-check Unfiled; children are promoted automatically.
- Rules for the next iterations:
  - Destructive work — `npx supabase db reset`, seeded runs, share-matrix scripts, ad-hoc `delete`/`update` SQL — is **local only**. The hosted project receives schema changes via `scripts/apply-migrations.ps1` after `npx supabase test db` is green locally.
  - Before any hosted change that touches rows, take a Settings → Export JSON backup and keep it out of the repository.
  - `scripts/seed-notes.mjs` refuses non-local URLs; do not weaken that guard.
  - Two-account smoke test, exports and PWA install now run against the real account with real content — assume anything written there is the owner's private notes, and prefer read-only checks where possible.
- Next action: unchanged — review and deploy the scrolling fix, then collect the smoke-test/export/PWA evidence.

## Handoff — Phase 7, scrolling regression fixed (2026-10-29)

- Owner decisions taken before code: the collapse **keeps reclaiming space** (the rows still disappear; the scroller is scrolled by the height they gave back so the text never moves) and the phone overflow menu is **deferred** (the header keeps wrapping to two rows).
- Changed: `src/lib/headerCollapse.ts` is a pure rule over `{collapsed, baseline}` taking `scrollTop`, `delta` (per-event movement), `chromeHeight` and `headerHasFocus` — collapse needs position past `80 + chrome + 48` **and** ≥48 px of travel from the last toggle, expand is position-only below 80, a per-event `|delta| > 200` is layout and re-seeds, focus expands and re-seeds; `compensateScrollTop` pays the height back (`max(0, scrollTop + after - before)`). `useHeaderCollapse` coalesces to one decision per animation frame, measures the rows via the same selector as the focus guard, pauses 250 ms after `window`/`visualViewport` resize, and applies the compensation in a `useLayoutEffect` before paint, re-seeding both trackers; `reset()` now seeds from the container's real `scrollTop`. CSS adds `overscroll-behavior: contain` and `overflow-anchor: none` to `.editor-body`. NoteEditor attaches `bodyRef`, and the save status is announced from a permanent `sr-only` `role="status"` region (the visible chip is `aria-hidden`) so it keeps announcing while collapsed.
- Green: `npm test` (460 tests, 52 files), `npm run typecheck`, `npm run build`. Tests were written first and were red (23 failures) before the implementation.
- Browser acceptance (local Supabase + `npm run dev`, desktop viewport; the in-app browser cannot emulate a phone width): on the 22,000-char note, a scripted down-and-up scroll sampled on every frame moved the first paragraph by at most **0.8 px** beyond what was scrolled, with **exactly 1 collapse + 1 expand** (at the collapse frame `scrollTop` 320 → 186.4 = −174 px chrome, text still); **60 one-pixel oscillations across the fold produced exactly 1 flip**; switching notes while scrolled down and collapsed reopened the header and a 100 px nudge did not re-collapse it; console clean.
- Red / not run: `npx supabase test db` was not run (no SQL changed; it is still expected red at 6/175 from the Phase 6 import pollution — owner chose not to reset). The phone-width (390×844) run, the keyboard-open run and the installed-PWA check cannot be done from this desktop browser and are **owed after deploy**.
- Deployed **2026-10-29** by standing instruction ("for this project always commit, push and deploy"): pushed `7450d39..6e40277`, then `npm run deploy` → READY, production aliased. The served bundle was verified afterwards: new CSS asset carries `overscroll-behavior` and `overflow-anchor`, the viewport meta is intact, and the three JS chunks hold no `service_role`.
- Next action: verify on the phone (slow scroll across the fold, fast fling, note switch while scrolled down, attachment bar mid-scroll, caret with the keyboard open), then collect the remaining Phase 7 evidence. Update the status above when it lands; do not start a new phase without agreeing with the owner.
- Environment: Docker Desktop was started by this session; local Supabase running (`npx supabase start`), dev server on `localhost:5173`, signed in as `owner@folio.local` through Mailpit. Note: the in-app browser pauses `requestAnimationFrame` while the desktop window is not visible — bring the window forward before any browser run, otherwise scripts hang.

## Handoff — Phase 7, fix session: scrolling flashes (header collapse)

- Symptom (owner, installed PWA, 2026-10-29): scrolling a note flashes/shakes, the reading position will not hold, and it is worse with the keyboard open. The scroll itself works; the chrome above it is toggling.
- Cause, one line: backlog item 3 collapses by `display: none` on `.editor-header` + `.editor-meta-row`, which sit *above* the `.editor-body` scroller — so a 1 px scroll reversal physically moves the note under the finger by the header's full height (~145 px on a phone), and item 3 decides on the sign of a single delta with no deadband. Full analysis, numbers, and the three mechanisms are in `docs/PLAN.md` → "Regression (2026-10-29, owner report)".
- Files in play: `src/lib/headerCollapse.ts` (rule), `src/hooks/useHeaderCollapse.ts` (ref seeding + focus guard), `src/components/NoteEditor.tsx` (class on `.editor-pane`, `onScroll` on `.editor-body`, `resetHeaderCollapse()` on note change), `src/styles/editor.css` (collapse rule at ~line 321, mobile header wrap at ~473), `src/styles/editor.test.ts` (CSS guards), `src/hooks/useHeaderCollapse.test.ts` (encodes the zero-baseline bug), `index.html` (`interactive-widget`, item 1).
- Known amplifiers, all traced to code: scroll anchoring is never disabled; `reset()` seeds the tracker to 0 instead of the container's real `scrollTop` (switching notes while scrolled down injects a phantom ±2000 px delta); keyboard-driven layout resizes clamp `scrollTop` every frame; opening the `AttachmentArea` summary or a banner changes the pane height mid-scroll; mobile over-scroll has no `overscroll-behavior: contain`.
- Next action: confirm the approach with the owner before editing (the write-up recommends keeping the chrome's height constant and compacting its contents, plus a deadband wider than the chrome and a travel threshold, plus seeding the tracker from the real scroll position). Then failing tests first (`headerCollapse` rule tests for ±1 px jitter and sub-threshold travel, `useHeaderCollapse` tests for phantom deltas and keyboard resize, `editor.test.ts` for `overscroll-behavior` and the constant-height slot), green `npm test` / `typecheck` / `build`, browser acceptance on 390x844 and a real phone, then commit and `npm run deploy`.
- Decisions needed: does collapsing get to reclaim the space (risk stays, only the flash is fixed) or not (the header becomes a compact one-line bar at constant height — the recommendation)? Whether the phone header should stop wrapping to a second row (move pin/archive/share into an overflow menu). Whether scroll anchoring is disabled on the scroller.
- Guards that must survive the rewrite: header never hides while focus is inside it; the `role="status"` save indicator stays visible or at least keeps announcing; the formatting toolbar stays pinned; no change to autosave, sharing, or the attachment bar's collapsed default.
- Environment: nothing running at handoff, working tree was clean at `7450d39`. Local Supabase data holds the 145-note JEX import, so pgTAP is expected red at 6/175 until a reset — unrelated to this bug. The PWA on the phone loads the deployed build, so the fix is only verifiable on device after `npm run deploy`.
- Note: this is live in production from `5ddc22a`; nothing is reverted, so the deployed PWA keeps misbehaving until the fix ships.

## Handoff — Phase 7, polish backlog done

- Changed: all five items from `docs/PLAN.md` → "Polish backlog" are implemented and browser-verified. Item 1: `interactive-widget=resizes-content` in `index.html` plus `flex: 0 0 auto`/`min-height` on header, meta row, and toolbar. Item 2: `.tiptap img` capped at `min(480px, 100%)`, new `src/components/ImageViewer.tsx` lightbox, `src/lib/imageView.ts` click resolver. Item 3: `src/lib/headerCollapse.ts` pure rule + `src/hooks/useHeaderCollapse.ts`, collapsed class hides header/meta rows. Item 4: `AttachmentArea` collapsed to a one-line `aria-expanded` summary that expands on click/drag/upload. Item 5: `useAutosave` baseline + no-op flush skip (`unchanged` reducer event; baseline seeded by `reset(version, syncedContent)`, dropped on any failed save), with `onUnchanged` in NoteEditor clearing the draft without refetching the list.
- Also changed: `vitest.config.ts` sets `css: true` so tests can read stylesheets with `?raw` (`src/styles/editor.test.ts` guards the CSS/viewport rules); banner JSX moved out of the 1,040-line `NoteEditor.tsx` into `NoteBanners.tsx` plus the `useHeaderCollapse` extraction — `NoteEditor.tsx` is back to 985 lines (the review skill's ~1,000-line threshold was the reason).
- Green: `npm test` (447 tests, 52 files), `npm run typecheck`, `npm run build`.
- Red: `npx supabase test db` fails 6/175 assertions in `attachment_usage_test.sql` (1-3) and `search_test.sql` (5, 9, 11) — pre-existing data pollution from the Phase 6 JEX import, not this session (no SQL changed). Arithmetic proof: the tests expect the fixture's 2 attachments/3,500 bytes but see 14/519,304 = fixture + the import's 12/515,804 exactly; the search counts pick up imported recipe notes ("basil", "tomato"). Owner chose to leave local data intact rather than `npx supabase db reset`; the suite passes on a clean database (175 green at Phase 6). If a future session resets, re-run pgTAP to confirm green, then recreate the two accounts through Mailpit.
- Acceptance evidence (local two accounts): reverted keystroke → 0 requests and status returns to "Saved"; real edit → exactly 1 `save_note`; edit after a skipped no-op still saves; read-only partner sees the shared note with banner, no toolbar, no writes; header collapse/expand on scroll verified live; image cap + lightbox + Escape verified; attachment summary "ATTACHMENTS 4 ▸" expand/collapse verified; note content byte-identical after the edit/undo test cycle (test characters removed).
- Next action: Phase 7 remainder — two-account production smoke test, both exports from Settings, PWA install on a phone, then mobile/a11y passes and the 5,000-note load test. Update the status above when evidence lands; do not start a new phase without agreeing with the owner.
- Decisions taken: no-op save compares against a baseline that any failed save invalidates (never assume unknown content matches); lightbox closes on any tap including the image itself; header never hides while focus is inside it; `NoteBanners` is presentational (status flags in, banners out).
- Environment: `npx supabase start` was already running; a second Vite dev server (`npx vite --host 127.0.0.1 --port 5173`) gives the partner origin its own localStorage — the primary server binds only `::1`. Two accounts exist locally: `owner@folio.local` and `partner@folio.local` (created through Mailpit).
- Deployed and pushed 2026-10-29: `npm run deploy` (READY, alias `folio-ten-mauve.vercel.app` plus the project alias), `git push origin main` (`bacd48e..5ddc22a`). Verified on the live origin: viewport marker, all four new code markers in the served chunks, CSP intact, HTML `no-cache`, no `service_role`, sign-in screen renders with a clean console. Note: `folio.vercel.app` belongs to an unrelated project ("Denmercs Photography") — it is not one of our aliases.

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
