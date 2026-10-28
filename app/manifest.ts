import type { MetadataRoute } from "next";

// Lets staff and managers add QR Clock to their phone's home screen. The kiosk has its own
// full-screen manifest (/kiosk.webmanifest).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QR Clock",
    short_name: "QR Clock",
    description: "Clock in and out with your QR card, and see your hours.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
