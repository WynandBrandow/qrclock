// First-run setup: one company and its first administrator. Safe to run again.
// Run: npm run seed -- "<Business name>" "<Admin full name>" <admin email>
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.mjs";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const [company, adminName, adminEmail] = process.argv.slice(2);
if (!company || !adminName || !adminEmail) {
  console.error('Usage: npm run seed -- "<Business name>" "<Admin full name>" <admin email>');
  process.exit(1);
}

let { data: co } = await db.from("companies").select("id, name").eq("name", company).maybeSingle();
if (!co) {
  ({ data: co } = await db.from("companies").insert({ name: company }).select("id, name").single());
  console.log("created company", co!.name);
}
const email = adminEmail.toLowerCase();
const { data: existing } = await db.from("employees").select("id").eq("company_id", co!.id).eq("email", email).maybeSingle();
if (existing) {
  await db.from("employees").update({ role: "admin", active: true }).eq("id", existing.id);
  console.log("admin already present:", email);
} else {
  await db.from("employees").insert({ company_id: co!.id, full_name: adminName, email, role: "admin" });
  console.log("created admin", adminName, email);
}
