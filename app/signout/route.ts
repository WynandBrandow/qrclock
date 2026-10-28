import { NextResponse, type NextRequest } from "next/server";
import { endSessions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await endSessions();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
