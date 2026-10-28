// Reads D:\qrclock\.env.local for scripts. Values in the file always win over the shell's
// environment: this PC has another project's Supabase keys set system-wide, and a script must
// never pick those up by accident.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../.env.local", import.meta.url));
export const env: Record<string, string> = Object.fromEntries(
  readFileSync(file, "utf8").split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes("vubrnyoecvtkfrlwvwuv")) throw new Error(".env.local is not QR Clock's");
