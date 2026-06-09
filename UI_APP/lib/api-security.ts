import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionRoleFromCookies, type SessionRole } from "@/lib/auth-session";
import { isMongoConnectivityError } from "@/lib/mongo-client-pool";

type Role = SessionRole;

const ROLE_WEIGHT: Record<Role, number> = {
  client: 1,
  admin: 2,
};

const GENERIC_INTERNAL_ERROR = "internal_error";

export async function requireRole(minRole: Role) {
  try {
    const role = await getSessionRoleFromCookies(await cookies());
    if (!role) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      };
    }
    if (ROLE_WEIGHT[role] < ROLE_WEIGHT[minRole]) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
      };
    }
    return { ok: true as const, role };
  } catch (error) {
    console.error("[api-auth] session check failed", error);
    if (isMongoConnectivityError(error)) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "service_unavailable" },
          { status: 503 }
        ),
      };
    }
    return {
      ok: false as const,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
}

export async function requireClientRole() {
  return requireRole("client");
}

export async function requireAdminRoleStrict() {
  return requireRole("admin");
}

export function ensureContentLengthWithin(
  request: Request,
  maxBytes: number
): NextResponse | null {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const len = Number(raw);
  if (!Number.isFinite(len) || len < 0) {
    return NextResponse.json({ error: "invalid_content_length" }, { status: 400 });
  }
  if (len > maxBytes) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  return null;
}

export function sanitizeErrorResponse(
  routeName: string,
  error: unknown,
  status = 500
) {
  console.error("[api-error]", routeName, error);
  return NextResponse.json({ error: GENERIC_INTERNAL_ERROR }, { status });
}

export function parsePositiveIntBounded(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number | null {
  if (value == null || value.trim() === "") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}
