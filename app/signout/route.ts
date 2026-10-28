import { NextResponse, type NextRequest } from "next/server";
import { endSessions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Only our own pages may sign someone out.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return new NextResponse("Forbidden", { status: 403 });
  await endSessions();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
