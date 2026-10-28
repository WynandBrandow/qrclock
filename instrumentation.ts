import type { Instrumentation } from "next";

// Every server error is written to app_errors in QR Clock's own database, so it shows on the
// Review page and in the managers' daily summary instead of vanishing from short-lived logs.
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : null;
  if (digest?.startsWith("NEXT_")) return; // redirects and not-found are control flow, not errors
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/app_errors`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ path: request.path.slice(0, 300), method: request.method, message: message.slice(0, 1000), digest }),
    });
  } catch {
    // Reporting must never cause a second failure.
  }
};
