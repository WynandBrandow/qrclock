import "server-only";
import { createCipheriv, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { db } from "./supabase/server";

// Every table, in an order that restores cleanly (parents first).
export const BACKUP_TABLES = [
  "companies", "locations", "employees", "kiosks", "public_holidays",
  "clock_events", "event_corrections", "timesheet_approvals", "scan_log",
] as const;

const PAGE = 1000;

export async function dumpAll() {
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await db().from(t).select("*").order("id").range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    tables[t] = rows;
  }
  return { format: "qrclock-backup-v1", created_at: new Date().toISOString(), tables };
}

function key() {
  const k = Buffer.from(process.env.BACKUP_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("BACKUP_KEY must be 32 bytes, base64");
  return k;
}

/** gzip, then AES-256-GCM. Layout: "QCB1" | iv(12) | tag(16) | ciphertext. scripts/backup-open.mts reverses it. */
export function seal(obj: unknown): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(gzipSync(JSON.stringify(obj))), c.final()]);
  return Buffer.concat([Buffer.from("QCB1"), iv, c.getAuthTag(), body]);
}
