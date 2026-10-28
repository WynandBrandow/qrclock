"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR code drawn in the browser (for one-off links such as kiosk pairing). */
export default function QrImage({ value }: { value: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setSvg);
  }, [value]);
  return <div className="aspect-square bg-white" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
