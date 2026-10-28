# QR Clock (qrclock)

Employee time clock for **Aramex Maryborough** (Qld, up to 14 staff). Staff clock in and out by scanning the depot's
QR poster with their own phone (a kiosk tablet is optional, for later). Managers review, correct, approve and export
weekly hours for payroll. Standalone and multi-company ready; one company today. Owner: Mathys Brandow.

## Where everything is

| What | Where |
| --- | --- |
| Live app | https://clock.ccov.co.za (qrclock.vercel.app 308-redirects there) |
| Code | `D:\qrclock`, GitHub `WynandBrandow/qrclock` (private). A push to `main` deploys to Vercel and runs CI. |
| Hosting | Vercel project `qrclock`, team wynandbrandows-projects, region syd1, Hobby plan (move to Pro at launch: commercial use) |
| Database | Supabase `vubrnyoecvtkfrlwvwuv`, org "QR Clock", free plan, Sydney. Migrations in `supabase/migrations`. |
| Domain / DNS | ccov.co.za at Xneelo (konsoleH). `clock` CNAME → Vercel. Xneelo publishes slowly (up to ~30 min) and once appended `.ccov.co.za` to CNAME targets; check with `nslookup -type=CNAME <name> ns1.host-h.net`. |
| Email | Resend (account wynandb@ccov.co.za, send-only key `RESEND_API_KEY`), domain ccov.co.za verified. Supabase auth SMTP → smtp.resend.com, from noreply@ccov.co.za, 30/hour. |
| Backups | Private Vercel Blob store `qrclock-backups` (see Records) |
| Secrets | `.env.local` (never committed): Supabase URL/anon/service keys, `APP_SECRET`, `CRON_SECRET`, `BACKUP_KEY`, `RESEND_API_KEY`, `DATABASE_URL`. Same names on Vercel (production). DB password is not stored here. |
| People docs | Admin manual (Morne): https://claude.ai/artifact/NZsCJ37jPo1uHMq1jxGDme · Staff Quick Start: https://claude.ai/artifact/HeGR77NzrXqErFiNP9CMdG · Staff announcement + FAQ: https://claude.ai/artifact/KVr6Xhr846KALk8oWSenop · WhatsApp go-live note: `docs/whatsapp-morne.txt`. Update the manuals whenever behaviour staff or admins see changes. |

## People and current settings (Aramex Maryborough)

- Administrators: Mathys Brandow (wb@ccov.co.za, used by the live tests), Morne du Toit (morne.toit@aramex.com.au, 0458 495 349).
- Location: *Maryborough depot*, position −25.5157895, 152.6766181 (Google Maps pin), radius 200 m.
- Settings: time zone Australia/Brisbane, pay week Monday, breaks tracked, meal breaks unpaid, no separate rest breaks,
  meal-break warning after 5 h / 30 min, repeat-scan window 60 s, long shift 14 h, **phone clocking on (record and flag)**,
  refuse-far-scans off, **Face ID / fingerprint off**, daily summary email off. No kiosk paired, no staff added yet.

## Rules that matter

- **The browser never touches the database.** RLS is on with no policies. All reads/writes run on the server with the
  service-role client (`lib/supabase/server.ts → db()`) after a role check (`requireViewer` in pages, `assertViewer` in
  actions/routes). Every query filters by the viewer's `company_id`.
- **Clock events are append-only.** Corrections go through the SQL functions `correct_event`, `add_event`, `void_event`,
  `resolve_flag`; they keep the original (`superseded`/`voided`) and log to `event_corrections`. Never update an event's time or kind.
- **Punches go through `record_punch`** (row lock, repeat-scan window, flags, location/distance). The UI offers only `nextActions()` from `lib/shifts.ts`.
- **Shift maths** (pairing, paid/unpaid breaks, midnight split, weekday/Sat/Sun/public-holiday buckets, meal-break
  warning) lives in `lib/shifts.ts`, pure and unit-tested; time zones in `lib/time.ts` (company zone, never server/browser).
- **The menu lives in `lib/nav.ts`; never add a menu item anywhere else** (Sidebar ≥1024 px, sliding MobileNav below).
- **Stay inside this project.** Only write to QR Clock's own repo, Supabase project, Vercel project and Blob store. Other
  projects' keys on this PC may be read but never used to change anything (Mathys, 29 Oct 2026).

## How sign-in and clocking work

- **Email sign-in:** `/login` → magic link. The template (`supabase/templates/magic_link.html`) links to `/auth/confirm`
  with a token_hash, which shows a Continue button first: works on any device, and email scanners can't use it up.
  Public sign-up is off (`[auth] enable_signup = false`); the login action creates the auth user only for an active
  employee. **Never set `[auth.email] enable_signup = false`: it turns off email sign-in entirely.** test:db checks both.
- **Card + PIN:** scanning your own card with a phone opens `/q/<token>` → PIN (atomic escalating lockout via
  `pin_attempt`). Session cookie `qc_pin`: 12 h, or 120 days with "keep me signed in". Treated as role `employee` only.
  A new PIN or card bumps `pin_version`, ending open sessions.
- **Phone clocking:** the location's poster opens `/c/<qr_token>`. The phone shares its position once per tap; only
  `distance_m` is stored; far or unknown = flag `away_from_site` / `no_location`, or refused if `phone_require_location`.
- **Passkeys (optional, `phone_require_passkey`):** Face ID / fingerprint confirms each phone punch (`lib/passkeys.ts`,
  @simplewebauthn v14). rpID = hostname of `NEXT_PUBLIC_APP_URL`, so a domain change means staff set up again.
- **Kiosk (optional):** paired once via a one-time link (GET shows a button, POST pairs); the tablet keeps `qc_kiosk`,
  renewed on each scan and heartbeat. Setup → Kiosks shows health.

## Records, approvals, backups

- Time records are permanent: triggers block deleting events/corrections/approvals and editing event times. Only
  `purge_test_data` / `backdate_test_events` (TEST-named data only) bypass them, for the test scripts.
- Approvals (`timesheet_approvals`) are append-only with a content hash of the week's events; an approved week is
  locked until reopened with a reason. Managers can't change or approve their own or an admin's hours.
- Daily job: pg_cron `qrclock-daily` (02:30 AEST) in QR Clock's own DB → `public.call_daily_job()` (pg_net; secret in
  Vault `qrclock_cron_secret` = Vercel `CRON_SECRET`) → `https://clock.ccov.co.za/api/cron/daily`: keep-alive (free plan
  pauses after 7 idle days), encrypted backup (`backups/<UTC date>.qcb`; 90 days daily, 8 years monthly), scan_log
  pruned after 90 days, optional manager summary email. Result: `select * from net._http_response order by id desc limit 1`.
- Restore: `vercel blob get backups/<date>.qcb --access private --rw-token <BLOB_READ_WRITE_TOKEN>` (pull the token with
  `vercel env pull <scratch file> --environment production`, then delete the file), then `npm run backup:open -- <file>`.
- Server errors are recorded in `app_errors` (instrumentation.ts).

## Commands and testing

- `npm run verify:all -- --public-dns`: everything (types, lint, unit, database rules, live end-to-end, live page sweep at
  375/768/1280). **Run after every deploy.** `-- --quick` = static + unit only.
- `npm run verify:live` (`scripts/live-flow.mjs`): 14 live steps as Mathys with a minted session (no email sent): kiosk
  pairing, fake-camera QR scan, USB-scanner Enter bug, correction, approval, CSV, card + PIN, phone clocking with fake
  GPS, passkeys via a virtual authenticator, sign-in link. Creates TEST data and purges it.
- `npm test` (unit), `npm run test:db` (database rules in a throwaway TEST company), `npm run seed`, `npm run backup:open`.
- After schema changes: `npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts`, then
  `npx next typegen`.
- Supabase auth config lives in `supabase/config.toml`; push with
  `RESEND_API_KEY=<from .env.local> npx supabase config push --project-ref vubrnyoecvtkfrlwvwuv` (answer no to storage).
  One-off SQL: `npx supabase db query --linked "<sql>"`.

## Traps on this PC

- **Eternal Echoes' Supabase keys are set as system-wide env vars.** Scripts read `.env.local` through `scripts/env.mts`,
  which wins over the shell and refuses any other project's file. Never fall back to `process.env` in a script.
- **New domains and local DNS:** this network's router can cache a new name as missing for up to a day. Use
  `--public-dns` on live tests; fetch from inside the page, not with Playwright's Node-side request.
- **Git:** the PC's GitHub token can't push `.github/workflows/*` (no workflow scope); Mathys adds those on github.com.
  Pull before pushing if he edited on GitHub.
- **Shells:** run Playwright scripts from PowerShell; Git Bash rewrites `/paths`. Avoid nested quotes in bash heredocs.
- **Next.js 16:** `cacheComponents` off; pages stream behind `loading.tsx`, so a `redirect()` can arrive after the first
  bytes (wait for the URL in tests). Route types need `npx next typegen` after adding routes.

## Session log

- 28 Oct 2026: project created; schema, kiosk, timesheets, review, setup, CSV export.
- 29 Oct 2026: 5-agent audit → hardening + payroll readiness (permanent records, locked approvals, Qld holidays,
  midnight split, breaks, export, kiosk fixes, backups, keep-alive); Phase 3 (onboarding, PWA, cards and key tags, a11y,
  alerts); Resend email; custom domain clock.ccov.co.za; CI on GitHub; company renamed Aramex Maryborough; Morne added;
  phone clocking via depot poster (Mathys chose it over buying a tablet); optional passkeys; manuals written.
  verify:all 6/6, live 14/14.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
