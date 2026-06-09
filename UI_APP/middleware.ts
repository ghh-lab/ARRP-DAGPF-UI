import { NextRequest, NextResponse } from "next/server";
import { POST_LOGIN_FRESH_COOKIE } from "@/lib/auth-gate";

export function middleware(req: NextRequest) {
  const isAppPath = req.nextUrl.pathname === "/app" || req.nextUrl.pathname === "/app/";
  if (!isAppPath) {
    return NextResponse.next();
  }

  const fresh = req.nextUrl.searchParams.get("fresh");
  const hasFreshCookie = req.cookies.get(POST_LOGIN_FRESH_COOKIE)?.value === "1";

  if (fresh !== "1" || !hasFreshCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const res = NextResponse.next();
  res.cookies.set({
    name: POST_LOGIN_FRESH_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return res;
}

export const config = {
  matcher: ["/app"],
};
