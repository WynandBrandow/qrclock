// Decrypts a QR Clock backup to plain JSON, for checking or restoring.
// Download one first:  npx vercel blob get backups/<date>.qcb   (or from the Vercel dashboard)
// Run:                  npm run backup:open -- <file.qcb> [out.json]
// Needs BACKUP_KEY in .env.local (the same key as on Vercel; keep a copy somewhere safe).
import { readFileSync, writeFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { env } from "./env.mjs";

const [file, out = file.replace(/\.qcb$/, "") + ".json"] = process.argv.slice(2);
if (!file) { console.error("Usage: npm run backup:open -- <file.qcb> [out.json]"); process.exit(1); }

const key = Buffer.from(env.BACKUP_KEY ?? "", "base64");
const buf = readFileSync(file);
if (buf.subarray(0, 4).toString() !== "QCB1") throw new Error("not a QR Clock backup");
const d = createDecipheriv("aes-256-gcm", key, buf.subarray(4, 16));
d.setAuthTag(buf.subarray(16, 32));
const json = JSON.parse(gunzipSync(Buffer.concat([d.update(buf.subarray(32)), d.final()])).toString());
writeFileSync(out, JSON.stringify(json, null, 2));
console.log(`${out}: backup from ${json.created_at}`);
for (const [t, rows] of Object.entries(json.tables as Record<string, unknown[]>)) console.log(`  ${t}: ${rows.length}`);
