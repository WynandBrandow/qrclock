import { ImageResponse } from "next/og";

// App icons for the home screen. /icons/192, /icons/512, and /icons/maskable (extra padding so
// Android can crop it to any shape).
const SIZES: Record<string, { px: number; pad: number }> = {
  "180": { px: 180, pad: 0 }, "192": { px: 192, pad: 0 }, "512": { px: 512, pad: 0 }, maskable: { px: 512, pad: 0.2 },
};

export async function GET(_: Request, { params }: RouteContext<"/icons/[size]">) {
  const spec = SIZES[(await params).size];
  if (!spec) return new Response("Not found", { status: 404 });
  const { px, pad } = spec;
  const inner = px * (1 - pad * 2);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
        <div style={{
          width: inner, height: inner, display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0f172a", color: "#5eead4", fontSize: inner * 0.42, fontWeight: 800, letterSpacing: -inner * 0.02,
          borderRadius: pad ? 0 : inner * 0.18,
        }}>QR</div>
      </div>
    ),
    { width: px, height: px, headers: { "cache-control": "public, max-age=86400" } },
  );
}
