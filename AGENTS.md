# QR Clock (qrclock)

Employee time clock: staff scan a personal QR card at a kiosk tablet to clock in/out and take breaks;
managers review, correct and approve weekly hours. Standalone, multi-company ready (one company today).

- **Live:** https://qrclock.vercel.app (Vercel project `qrclock`, team wynandbrandows-projects, region syd1). Deployed with `vercel deploy --prod` from this folder; GitHub `WynandBrandow/qrclock` (private), connected to Vercel: a push to main deploys.
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
- Sign-in: email magic link (`/login`), or card + PIN on a phone (`/q/<token>`, 12 h cookie, treated as role `employee` only).
- Kiosk devices: paired once via a one-time link (Setup → Kiosks); the device keeps an httpOnly secret cookie (`qc_kiosk`).

## Commands

- `npm test`: shift/time unit tests. `npm run test:db`: database rules against the real project (throwaway company, cleaned up).
- `npm run verify:live`: end-to-end on the live site as Mathys (minted session): kiosk pairing, scans, correction, approval, CSV, card + PIN. Creates TEST data and deletes it. Run after every deploy.
- `npm run seed -- "<Business>" "<Admin name>" <email>`: first company + admin.
- After schema changes: `npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts`.

## Session log

- 28 Oct 2026: project created; schema, kiosk, timesheets, review, setup, CSV export; seeded "Allegra Hervey Bay" with Mathys as admin. Live at qrclock.vercel.app; verify:live 10/10.
  Magic-link email uses Supabase's built-in sender, which only delivers to the org's own members and ~2 emails/hour: add custom SMTP (Supabase → Auth → SMTP) before inviting staff by email.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
