import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sanitizeErrorResponse } from "@/lib/api-security";
import { getSessionRoleFromCookies } from "@/lib/auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const role = await getSessionRoleFromCookies(await cookies());
    if (!role) {
      return NextResponse.json({ ok: false as const, authenticated: false });
    }
    return NextResponse.json({ ok: true as const, authenticated: true, role });
  } catch (e) {
    return sanitizeErrorResponse("auth-session.GET", e);
  }
}
