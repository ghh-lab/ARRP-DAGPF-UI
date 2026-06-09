import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeErrorResponse } from "@/lib/api-security";
import {
  AUTH_SESSION_COOKIE,
  authCollections,
  sha256Hex,
  withMongoAuthDb,
} from "@/lib/mongo-auth";
import { POST_LOGIN_FRESH_COOKIE } from "@/lib/auth-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cookieSecureFromRequest(req: NextRequest): boolean {
  const forced = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (forced === "1" || forced === "true" || forced === "yes" || forced === "on") {
    return true;
  }
  if (forced === "0" || forced === "false" || forced === "no" || forced === "off") {
    return false;
  }
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    const firstProto = forwardedProto.split(",")[0]?.trim().toLowerCase();
    if (firstProto === "https") return true;
    if (firstProto === "http") return false;
  }
  return req.nextUrl.protocol === "https:";
}

export async function POST(req: NextRequest) {
  try {
    const secureCookie = cookieSecureFromRequest(req);
    const token = (await cookies()).get(AUTH_SESSION_COOKIE)?.value;
    if (token) {
      const tokenHash = sha256Hex(token);
      await withMongoAuthDb(async ({ db }) => {
        const { sessions } = authCollections(db);
        await sessions.deleteOne({ tokenHash });
        return undefined;
      });
    }
    const res = NextResponse.json({ ok: true as const });
    res.cookies.set({
      name: AUTH_SESSION_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: 0,
    });
    res.cookies.set({
      name: POST_LOGIN_FRESH_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (e) {
    return sanitizeErrorResponse("auth-logout.POST", e);
  }
}
