// Manifest for the kiosk tablet: added to the home screen, it opens straight into the kiosk,
// full screen, dark. (Pair from inside the installed app: on iPads it has its own cookies.)
export function GET() {
  return Response.json({
    name: "QR Clock Kiosk",
    short_name: "Kiosk",
    start_url: "/kiosk",
    scope: "/kiosk",
    display: "fullscreen",
    orientation: "any",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "content-type": "application/manifest+json" } });
}
