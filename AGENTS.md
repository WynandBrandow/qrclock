# QR Clock (qrclock)

Employee time clock: staff scan a personal QR card at a kiosk tablet to clock in/out and take breaks;
managers review, correct and approve weekly hours. Standalone, multi-company ready (one company today).

- **Live:** https://clock.ccov.co.za (qrclock.vercel.app redirects there; Vercel project `qrclock`, team wynandbrandows-projects, region syd1). Deployed with `vercel deploy --prod` from this folder; GitHub `WynandBrandow/qrclock` (private), connected to Vercel: a push to main deploys.
- **Database:** Supabase project `vubrnyoecvtkfrlwvwuv` (org "QR Clock", free plan, Sydney). Migrations in `supabase/migrations`, apply with `npx supabase db push`.
- **Stack:** Next.js 16 (App Router, classic dynamic rendering, `cacheComponents` off), Tailwind 4, `@supabase/ssr`.

## Rules that matter

- **The browser never touches the database.** RLS is on with no policies. All reads/writes run on the server with the
  service-role client (`lib/supabase/server.ts → db()`) after a role check (`requireViewer` in pages, `assertViewer` in
  actions/routes). Every query must filter by the viewer's `company_id`.
- **Clock events are append-only.** Corrections go through the SQL functions `correct_event`, `add_event`, `void_event`,
  `resolve_flag`; they keep the original (status `superseded`/`voided`) and log to `event_corrections`. Never `update` an event's time or kind directly.
- **Punches go through `record_punch`** (row lock, repeat-scan window, flags). The kiosk only offers `nextActions()` from `lib/shifts.ts`.
- **Shift maths lives in `lib/shifts.ts`** (pure, unit-tested); time zones in `lib/time.ts` (company time zone, never server/browser).
- **The menu lives in `lib/nav.ts`; never add a menu item anywhere else** (Sidebar ≥1024 px, sliding MobileNav below).
- Sign-in: email magic link (`/login`; the email template in supabase/templates links to `/auth/confirm` with a
  token_hash, which shows a Continue button first, so it works on any device and email scanners can't use it up), or card + PIN on a phone (`/q/<token>`, 12 h cookie, treated as role `employee` only).
- Phone clocking (on for Aramex Maryborough, record-and-flag): staff scan the location's QR poster (`/c/<qr_token>`),
  signed in on their own phone (email, or card + PIN with a 120-day "remember"); the phone shares a position once per tap;
  only `distance_m` is stored; far/unknown = flag `away_from_site`/`no_location` (or refused if `phone_require_location`).
- Kiosk devices (optional): paired once via a one-time link (Setup → Kiosks); the device keeps an httpOnly secret cookie (`qc_kiosk`).

## Records, approvals, backups

- Time records are permanent: triggers block deleting events/corrections/approvals and editing event times. Only
  `purge_test_data` / `backdate_test_events` (TEST-named data only) can bypass them, for the test scripts.
- Approvals (`timesheet_approvals`) are append-only with a content hash of the week's events; an approved week is
  locked in the actions until reopened with a reason. Managers can't change/approve their own or an admin's hours.
- Daily job: pg_cron `qrclock-daily` (02:30 AEST) in QR Clock's own DB → `public.call_daily_job()` (pg_net, secret in
  Vault `qrclock_cron_secret` = Vercel `CRON_SECRET`) → `/api/cron/daily`: keep-alive, encrypted backup to the
  private Vercel Blob store `qrclock-backups` (`backups/<UTC date>.qcb`; 90 days daily, 8 years monthly), scan_log
  pruned after 90 days. Restore: `vercel blob get backups/<date>.qcb --access private --rw-token <BLOB_READ_WRITE_TOKEN>`,
  then `npm run backup:open -- <file>` (needs `BACKUP_KEY` from .env.local; keep a copy of that key somewhere safe).
- Stay inside this project: only write to QR Clock's own repo, Supabase project (vubrnyoecvtkfrlwvwuv), Vercel project
  and Blob store. Other projects' keys on this PC may be read but never used to change anything (Mathys, 29 Oct 2026).

## Commands

- `npm run verify:all`: every check (types, lint, unit, database rules, live end-to-end incl. a fake-camera QR scan,
  live page sweep) with a summary; `-- --quick` for static + unit only. Run after every deploy.
- `npm test`: shift/time unit tests. `npm run test:db`: database rules against the real project (throwaway company, cleaned up).
- `npm run verify:live`: end-to-end on the live site as Mathys (minted session): kiosk pairing, scans, correction, approval, CSV, card + PIN. Creates TEST data and deletes it. Run after every deploy.
- `npm run seed -- "<Business>" "<Admin name>" <email>`: first company + admin.
- Scripts read `.env.local` through `scripts/env.mts`, which wins over the shell and refuses any other project's file:
  this PC has Eternal Echoes' Supabase keys set system-wide (that's fine), so a script must never fall back to them.
- After schema changes: `npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts`.

## Docs for people

- Administrator's manual (Morne): https://claude.ai/artifact/NZsCJ37jPo1uHMq1jxGDme
- Staff Quick Start: https://claude.ai/artifact/HeGR77NzrXqErFiNP9CMdG
  Update both when behaviour staff or admins see changes.

## Not yet switched on

- CI: `docs/github-ci.yml` must be added on GitHub by hand (the PC's git token lacks the workflow scope).
- Daily summary email: off by default (Setup → Settings); "Email me a test summary" sends one to the clicking admin.

## Session log

- 28 Oct 2026: project created; schema, kiosk, timesheets, review, setup, CSV export; seeded the company with Mathys as admin (renamed "Aramex Maryborough" on 29 Oct 2026). Live at qrclock.vercel.app; verify:live 10/10.
- 29 Oct 2026: GitHub connected (push to main deploys). Audit with 5 agents → Phase 1+2 built: public sign-up closed,
  scanner-Enter kiosk bug, PIN lockout, permanent records, locked approvals, midnight split + holiday/weekend hours,
  rest vs meal breaks, payroll export, kiosk health, daily backup. test 19/19, test:db 17/17, verify:live 10/10.
  Resend live: ccov.co.za verified (Xneelo fixed the CNAMEs), Supabase sends sign-in links via smtp.resend.com from
  noreply@ccov.co.za, 30 emails/hour. Never set [auth.email] enable_signup = false: it turns off email sign-in
  entirely (it broke magic links for a few hours); test:db now checks the live auth settings.
- 29 Oct 2026 (later): wallet cards + key tags (QR level H), phone card, Phase 3 (onboarding, PWA, alerts, a11y,
  loading/error), cross-device sign-in link, verify:all 6/6 with live 12/12. Junk mail: links to vercel.app from a
  ccov.co.za sender; proposed custom domain clock.ccov.co.za. Broken Resend *receiving* MX (priority 9) on ccov.co.za
  must be deleted at Xneelo.
  Magic-link email uses Supabase's built-in sender, which only delivers to the org's own members and ~2 emails/hour: add custom SMTP (Supabase → Auth → SMTP) before inviting staff by email.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
