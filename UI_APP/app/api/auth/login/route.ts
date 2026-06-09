import { NextRequest, NextResponse } from "next/server";
import { ensureContentLengthWithin } from "@/lib/api-security";
import {
  AUTH_SESSION_COOKIE,
  authCollections,
  createSessionToken,
  ensureAuthReady,
  sha256Hex,
  withMongoAuthDb,
} from "@/lib/mongo-auth";
import { POST_LOGIN_FRESH_COOKIE } from "@/lib/auth-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Role = "admin" | "client";

type LoginBody = {
  role?: unknown;
  code?: unknown;
};

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "client";
}

function clientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor && forwardedFor.trim() !== "") {
    return forwardedFor.split(",")[0]!.trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim() !== "") return realIp.trim();
  return "unknown";
}

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
  const ip = clientIp(req);
  const secureCookie = cookieSecureFromRequest(req);
  let roleForLog: Role | "unknown" = "unknown";
  const oversized = ensureContentLengthWithin(req, 8 * 1024);
  if (oversized) return oversized;
  try {
    const body = (await req.json()) as LoginBody;
    const role = isRole(body.role) ? body.role : null;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!role || code === "") {
      await withMongoAuthDb(async ({ db }) => {
        const { logs } = authCollections(db);
        await logs.insertOne({
          ip,
          role: "unknown",
          success: false,
          reason: "invalid_payload",
          createdAt: new Date(),
        });
        return undefined;
      }).catch(() => undefined);
      return NextResponse.json(
        { ok: false as const, error: "Code invalide ou role invalide." },
        { status: 400 }
      );
    }
    roleForLog = role;

    return await withMongoAuthDb(async ({ db }) => {
      await ensureAuthReady(db);
      const { codes, sessions, logs, ipBlocks } = authCollections(db);
      const now = new Date();

      const block = await ipBlocks.findOne({ ip });
      if (block?.blocked) {
        await logs.insertOne({
          ip,
          role,
          success: false,
          reason: "ip_blocked",
          createdAt: now,
        });
        return NextResponse.json(
          {
            ok: false as const,
            error: "Adresse IP bloquee apres 5 tentatives.",
          },
          { status: 423 }
        );
      }

      const codeDoc = await codes.findOne({
        role,
        isActive: true,
        codeHash: sha256Hex(code),
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      });
      const isValid = codeDoc?.codeHash === sha256Hex(code);
      if (!isValid) {
        await ipBlocks.updateOne(
          { ip },
          {
            $inc: { failCount: 1 },
            $set: { updatedAt: now, lastFailedAt: now },
            $setOnInsert: { ip, blocked: false },
          },
          { upsert: true }
        );
        const blockAfterFail = await ipBlocks.findOne({ ip });
        const failCount = blockAfterFail?.failCount ?? 1;
        if (failCount >= 5) {
          await ipBlocks.updateOne(
            { ip },
            { $set: { blocked: true, blockedAt: now, updatedAt: now } }
          );
        }

        await logs.insertOne({
          ip,
          role,
          success: false,
          reason: failCount >= 5 ? "invalid_code_ip_blocked" : "invalid_code",
          createdAt: now,
        });
        return NextResponse.json(
          {
            ok: false as const,
            error:
              failCount >= 5
                ? "Adresse IP bloquee apres 5 tentatives."
                : "Code incorrect.",
          },
          { status: failCount >= 5 ? 423 : 401 }
        );
      }

      const token = createSessionToken();
      const tokenHash = sha256Hex(token);
      const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);

      await sessions.insertOne({
        tokenHash,
        role,
        ip,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      });

      await ipBlocks.updateOne(
        { ip },
        { $set: { failCount: 0, blocked: false, updatedAt: now } },
        { upsert: true }
      );

      await logs.insertOne({
        ip,
        role,
        success: true,
        reason: "login_success",
        createdAt: now,
      });

      await codes.updateOne(
        { role, codeHash: sha256Hex(code) },
        { $set: { lastUsedAt: now, updatedAt: now } }
      );

      const res = NextResponse.json({ ok: true as const, role });
      res.cookies.set({
        name: AUTH_SESSION_COOKIE,
        value: token,
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookie,
        path: "/",
        expires: expiresAt,
      });
      res.cookies.set({
        name: POST_LOGIN_FRESH_COOKIE,
        value: "1",
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookie,
        path: "/",
        maxAge: 60,
      });
      return res;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "login_failed";
    console.error("[auth-login] unexpected error", e);
    await withMongoAuthDb(async ({ db }) => {
      const { logs } = authCollections(db);
      await logs
        .insertOne({
          ip,
          role: roleForLog,
          success: false,
          reason: "login_error:" + msg,
          createdAt: new Date(),
        })
        .catch(() => undefined);
      return undefined;
    }).catch(() => undefined);
    return NextResponse.json({ ok: false as const, error: "internal_error" }, { status: 500 });
  }
}
