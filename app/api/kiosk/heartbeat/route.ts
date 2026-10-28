import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase/server";
import { currentKiosk, renewKioskCookie } from "@/lib/kiosk";

// The kiosk calls this on load and every few minutes: it shows the admin the kiosk is alive (and
// its camera works), keeps the pairing cookie fresh, and returns server time so the kiosk's clock
// matches the time punches are saved with.
export async function POST(req: NextRequest) {
  const k = await currentKiosk();
  if (!k) return NextResponse.json({ error: "not_paired" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const info = {
    camera: typeof body.camera === "string" ? body.camera.slice(0, 40) : null,
    online: !!body.online,
    wakeLock: !!body.wakeLock,
    battery: typeof body.battery === "number" ? Math.round(body.battery * 100) : null,
    charging: typeof body.charging === "boolean" ? body.charging : null,
    build: typeof body.build === "string" ? body.build.slice(0, 40) : null,
    agent: (req.headers.get("user-agent") ?? "").slice(0, 200),
  };
  const now = new Date().toISOString();
  const { error } = await db().from("kiosks").update({ last_heartbeat_at: now, client_info: info }).eq("id", k.kiosk.id);
  if (error) console.error("kiosk heartbeat", error.message);
  return renewKioskCookie(NextResponse.json({ now, build: process.env.VERCEL_DEPLOYMENT_ID ?? "dev" }), k.secret);
}
