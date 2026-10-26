# Folio

Working name. A fast, card-based notes app for one heavy note-taker and their partner: private by default, selectively shared per note, usable on the web and as an installable mobile app, and always exportable.

- [Product specification](docs/SPEC.md) — goals, requirements, UX, data model, acceptance criteria
- [Execution plan](docs/PLAN.md) — phases, test strategy, deployment runbook, risks
- [Agent guide](AGENTS.md) — how future sessions should work in this repo

## At a glance

- Web app + installable PWA (no native app stores in v1)
- WYSIWYG rich text with Markdown-style shortcuts
- Per-note sharing: read-only or can-edit, owner-controlled
- Notebooks, tags, full-text search, attachments, trash
- Server as source of truth: no device-to-device sync
- Export to Markdown, HTML, zip with attachments, and JSON backup
- Import from Joplin's Markdown export
- Supabase (Postgres, Auth, Storage, Realtime) + Vercel

## Status

Phase 1 is implemented: app shell, Supabase auth gate, magic-link sign-in, provider-gated Google button, theme system, and installable PWA skeleton.

Verified locally:

- 37 unit/component tests, typecheck, and production build pass.
- Magic link arrives in Mailpit, signs in through a real browser, and the session survives a browser restart.
- Light, dark, and system themes resolve correctly.
- The signed-in shell renders at desktop and 390px with no horizontal overflow.
- PWA manifest, icons, and service worker are generated; no API responses are cached by the service worker.
- The frontend bundle contains the publishable key, never the secret or service-role key.

Not done yet:

- Google OAuth is wired, but the button only appears when the Supabase project reports it as enabled. It needs a Google client ID/secret before it can be tested.
- No hosted Supabase or Vercel deployment exists yet.
- Notes, sharing, attachments, import, and export start in later phases.

## Local development

Requirements: Node 22+, Docker Desktop, and the Supabase CLI via `npx`.

```powershell
npm install
npx supabase start
Copy-Item .env.example .env.local
npx supabase status
```

Fill `.env.local` with the local `API_URL` and `PUBLISHABLE_KEY` from `npx supabase status`.

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`. Magic-link emails appear in the local Mailpit inbox at `http://127.0.0.1:54324`.

To enable Google locally:

1. Create a Google OAuth client with redirect URI `http://127.0.0.1:54321/auth/v1/callback`.
2. Set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in the shell before `npx supabase start`.
3. Set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, then restart the stack.

Hosted Supabase configures Google in the dashboard instead.

## Checks

```powershell
npm run test
npm run typecheck
npm run build
```

RLS tests arrive in Phase 2 and run with:

```powershell
npx supabase test db
```

## Notes

- `.npmrc` sets `legacy-peer-deps` because npm 10.9 mis-resolves Vitest 4's optional browser providers.
- Local Supabase state and `.env.local` are gitignored.
- The app uses PKCE for auth. Do not switch it to implicit flow.
