# Deployment runbook

The app ships as static files on Vercel and talks to a Supabase project. The
database goes live first, then the frontend. Nothing in this repository or in
public docs names the live URL, the project ref, or any key.

## 1. What the owner creates

These steps need account access and cannot be automated from the repository.

### Supabase project

1. Create a project at supabase.com, separate from ExpenseTracker.
2. Region: the closest European region (Frankfurt or Ireland for Portugal).
3. Save the database password in a password manager. It is shown once.
4. Record, from Project Settings → API and Project Settings → Database:
   - Project URL (`https://<ref>.supabase.co`)
   - Publishable (anon) key
   - Connection string (session pooler, port 5432 or 6543) including the password

### Authentication

1. Authentication → URL Configuration:
   - Site URL: the production origin **exactly** — `https://<domain>`, no trailing slash and no `/**`. The wildcard form belongs in the redirect list; in the Site URL it produces broken confirmation links.
   - Additional redirect URLs: `https://<domain>/**` and `http://localhost:5173/**`.
2. Email: the built-in sender is for testing only — it is rate limited, and in
   most projects it only delivers to team members. For the partner to sign in
   with a magic link, add custom SMTP (Resend, Postmark, SendGrid) under
   Authentication → Emails. Otherwise enable Google and skip email entirely.
3. Google (recommended, so sign-in never depends on email delivery):
   - Google Cloud console → OAuth consent screen (External), add both users as
     test users, or publish the app.
   - Credentials → OAuth client ID → Web application.
   - Authorised redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
   - Paste the client ID and secret into Authentication → Providers → Google.

### Vercel

1. Account, then `npx vercel login` from the repository (interactive).
2. `npm run deploy` creates the project on first run; accept the defaults
   (framework: Vite, build: `npm run build`, output: `dist`). `vercel.json`
   pins all three, so the defaults are only a fallback.
3. Keep the Vercel Git integration disconnected; deploy from the CLI. `link`
   connects the GitHub repository automatically — run
   `npx vercel git disconnect --yes` right after.
4. Turn off SSO deployment protection:
   `npx vercel project protection disable <project> --sso`. Team projects
   enable it by default and it intercepts every `*.vercel.app` URL with
   Vercel's own login page, which the partner cannot pass. The app's own
   sign-in screen is the public entry point; RLS protects the data.
5. Project → Settings → Environment Variables (Production and Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_STORAGE_LIMIT_BYTES` (optional; defaults to 1 GiB)

   Add them before the first deploy, or redeploy afterwards: Vite bakes them
   into the bundle at build time.

## 2. Where secrets live

| Secret | File (gitignored) | Used by |
| --- | --- | --- |
| `SUPABASE_DB_URL` | `supabase/.env.prod.local` | `scripts/apply-migrations.ps1` |
| Project URL and publishable key | Vercel project settings, and `.env.local` for local runs | Vite |
| Google client secret | Supabase dashboard only | Supabase auth |
| Vercel token (if not using interactive login) | shell environment only | `vercel` CLI |

`SUPABASE_DB_URL` is a single line in `supabase/.env.prod.local`, for example:

```text
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Never paste these values into chat, issues, documentation, or commit messages.

## 3. Local gate before deploying

```text
npm test
npm run typecheck
npm run build
npx supabase start
npx supabase db reset
npx supabase test db
```

All four must be green against the same commit that will ship.

## 4. Apply the database

Preferred route: let the CLI hold the credentials, so no password enters the
chat or a file.

```text
npx supabase login                       # opens a browser
npx supabase link --project-ref <ref>    # asks for the database password once
npx supabase migration list --linked     # remote history should be empty
npx supabase db push --dry-run           # lists the files to apply
npx supabase db push
npx supabase migration list --linked     # every file shows local == remote
```

`db push` commits each migration in its own transaction. On a fresh project
that is acceptable: a failure leaves the history at a known earlier migration
and the fix is a forward migration.

Fallback route, when the CLI is unavailable or a single transaction matters:

```text
pwsh scripts/apply-migrations.ps1
pwsh scripts/apply-migrations.ps1 -Verify
```

The script reads `SUPABASE_DB_URL` from the gitignored
`supabase/.env.prod.local`, refuses anything outside `supabase/migrations`,
refuses a localhost host, forces TLS, and runs every file in one transaction
with `ON_ERROR_STOP=1`. It uses the `postgres:17-alpine` container so no local
psql is needed (Docker Desktop must be running); the first run pulls the image.
Failure rolls back the whole batch. `-DryRun` lists the files without
connecting, and `-Verify` prints the public table count, policy count, and
whether the private `note-attachments` bucket exists.

Expected after the first run: 7 public tables, the RLS policies from all
migrations, and 1 private bucket.

Without Docker, verify over the REST API instead: request
`/rest/v1/notes?select=id&limit=1` with the anon key. A `401` with code `42501`
means the table exists and RLS denies anonymous reads, which is the expected
answer; a `404` means the table is missing.

## 5. Deploy the frontend

```text
npm run deploy
```

`npm run deploy` is `vercel --prod`. With the Git integration disconnected this
is the only path to production.

## 6. Verify production

Use the project's stable alias, not the per-deployment URL printed by
`vercel --prod` — that one changes on every deploy and must never be stored in
Supabase or a bookmark. `vercel inspect <deployment-url>` lists the aliases.

1. The page must be Folio's own sign-in screen. If it is a Vercel login page,
   SSO deployment protection is still on; see the Vercel steps in section 1.
2. Confirm the HTML references an asset under `/assets/` whose hash matches
   `dist/assets/` from the same build, and that the bundle contains
   `VITE_SUPABASE_URL` — Vite inlines it at build time, so a bundle without it
   means the environment variables were missing when the build ran.
3. Check the response headers: `Content-Security-Policy`, `Strict-Transport-Security`,
   `X-Content-Type-Options`, `X-Robots-Tag: noindex`, and `Cache-Control: no-cache`
   on the HTML. Hashed assets must be `immutable`; `/sw.js` must be `no-cache`.
4. Load a deep route such as `/settings/anything`; it must return the app shell,
   not a 404.
5. Browser console must be clean on first load and after sign-in.
6. Two-account smoke test: owner signs in, creates a note, attaches an image,
   shares it read-only with the partner; partner signs in, reads it, then edits
   with `edit` permission.
7. Export both formats from Settings; open the zip manifest.
8. Install the PWA on a phone from the same origin and open a note offline to
   see the shell load.
9. Confirm the service worker updates after a second deploy.

## 7. Rollback

- Frontend: Vercel → Deployments → promote the previous production deployment.
- Database: migrations are forward-only. Write and test a corrective migration
  locally, then apply it with the same script. Never hand-edit hosted data.

## 8. Operations

- Free-plan projects pause after about a week of inactivity; the first request
  after a pause is slow. Use a paid plan if that matters, or accept the pause.
- Backups depend on the plan; the JSON backup from Settings is the portable
  copy either way.
- Attachment storage is a private bucket with a 20 MB per-file limit set in
  `0005_attachments.sql`. Keep `VITE_STORAGE_LIMIT_BYTES` in step with the
  plan's storage allowance; it is only the meter shown in Settings.
- Rotate the database password in the dashboard if it is ever exposed, then
  update `supabase/.env.prod.local` and the Vercel environment variables that
  embed it (none: the frontend only holds the publishable key).
