import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { del, list, put } from "@vercel/blob";
import { db } from "@/lib/supabase/server";
import { dumpAll, seal } from "@/lib/backup";

export const maxDuration = 60;

const KEEP_DAILY_DAYS = 90;     // every day for 90 days
const KEEP_MONTHLY_YEARS = 8;   // the 1st of each month for 8 years (Fair Work: 7)
const SCAN_LOG_DAYS = 90;

// Called once a day by pg_cron (in the Allegra Supabase project, like Recovery Companion's
// keep-alive), with "Authorization: Bearer <CRON_SECRET>". It:
//   1. touches the database, so the free Supabase plan never pauses it,
//   2. writes an encrypted backup of every table to the private Blob store,
//   3. prunes old backups and old scan-log rows.
export async function POST(req: NextRequest) {
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  if (!process.env.CRON_SECRET || want.length !== got.length || !timingSafeEqual(want, got)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const backup = await dumpAll();
  const counts = Object.fromEntries(Object.entries(backup.tables).map(([t, rows]) => [t, rows.length]));
  const blob = await put(`backups/${today}.qcb`, seal(backup), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/octet-stream",
  });

  // Retention.
  const dailyCutoff = new Date(Date.now() - KEEP_DAILY_DAYS * 86400_000).toISOString().slice(0, 10);
  const monthlyCutoff = new Date(Date.now() - KEEP_MONTHLY_YEARS * 365 * 86400_000).toISOString().slice(0, 10);
  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "backups/", cursor, limit: 1000 });
    for (const b of page.blobs) {
      const date = b.pathname.slice("backups/".length, "backups/".length + 10);
      const monthly = date.endsWith("-01");
      if ((!monthly && date < dailyCutoff) || date < monthlyCutoff) old.push(b.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (old.length) await del(old);

  const { error: pruneError, count: pruned } = await db().from("scan_log").delete({ count: "exact" })
    .lt("created_at", new Date(Date.now() - SCAN_LOG_DAYS * 86400_000).toISOString());
  if (pruneError) console.error("scan_log prune", pruneError.message);

  return NextResponse.json({ ok: true, backup: blob.pathname, rows: counts, removedBackups: old.length, prunedScans: pruned ?? 0 });
}
