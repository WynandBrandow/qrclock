import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { getViewer } from "@/lib/auth";
import { cardUrl, QR_OPTIONS } from "@/lib/cards";

// The signed-in person's own card as a picture, to keep on their phone and show at the kiosk.
// Big and high-contrast so a kiosk camera reads it off a phone screen.
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return new Response("Not signed in", { status: 401 });
  const svg = await QRCode.toString(await cardUrl(v.employee.qr_token), { ...QR_OPTIONS, type: "svg", width: 760 });
  const download = new URL(req.url).searchParams.has("download");

  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: "#ffffff", padding: 60, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 34, color: "#475569", textTransform: "uppercase", letterSpacing: 3 }}>{v.company.name}</div>
        <div style={{ fontSize: 64, fontWeight: 700, color: "#0f172a", marginTop: 12 }}>{v.employee.full_name}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" width={760} height={760} style={{ marginTop: 40 }} src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} />
        <div style={{ fontSize: 32, color: "#475569", marginTop: 40, textAlign: "center" }}>Turn your screen brightness up and hold it to the kiosk camera.</div>
      </div>
    ),
    { width: 880, height: 1260 },
  );
  img.headers.set("cache-control", "private, no-store");
  if (download) img.headers.set("content-disposition", `attachment; filename="qr-card-${v.employee.full_name.replace(/[^A-Za-z0-9]+/g, "-")}.png"`);
  return img;
}
