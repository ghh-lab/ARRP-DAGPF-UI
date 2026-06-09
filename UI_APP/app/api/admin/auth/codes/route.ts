import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ensureContentLengthWithin, sanitizeErrorResponse } from "@/lib/api-security";
import { requireAdminRole } from "@/lib/auth-admin";
import {
  authCollections,
  ensureAuthReady,
  sha256Hex,
  withMongoAuthDb,
  type Role,
} from "@/lib/mongo-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateBody = {
  role?: unknown;
  name?: unknown;
  code?: unknown;
  expiresAt?: unknown;
};

type UpdateBody = {
  id?: unknown;
  role?: unknown;
  name?: unknown;
  code?: unknown;
  expiresAt?: unknown;
  isActive?: unknown;
};

function parseRole(v: unknown): Role | null {
  return v === "admin" || v === "client" ? v : null;
}

function parseOptionalDate(v: unknown): Date | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d;
}

function toSafeCodeRow(doc: {
  _id?: ObjectId;
  role: Role;
  name: string;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date | null;
}) {
  return {
    id: String(doc._id),
    role: doc.role,
    name: doc.name,
    isActive: doc.isActive,
    expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
  };
}

export async function GET() {
  const auth = await requireAdminRole();
  if (!auth.ok) return auth.response;
  try {
    return await withMongoAuthDb(async ({ db }) => {
      await ensureAuthReady(db);
      const { codes } = authCollections(db);
      const rows = await codes
        .find({})
        .sort({ role: 1, name: 1, createdAt: -1 })
        .toArray();
      return NextResponse.json({
        ok: true as const,
        rows: rows.map((r) => toSafeCodeRow(r)),
      });
    });
  } catch (e) {
    return sanitizeErrorResponse("admin-auth-codes.GET", e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRole();
  if (!auth.ok) return auth.response;
  const oversized = ensureContentLengthWithin(req, 16 * 1024);
  if (oversized) return oversized;
  try {
    const body = (await req.json()) as CreateBody;
    const role = parseRole(body.role);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const expiresAt = parseOptionalDate(body.expiresAt);
    if (
      !role ||
      name === "" ||
      name.length > 120 ||
      code === "" ||
      code.length > 256 ||
      expiresAt === undefined
    ) {
      return NextResponse.json(
        { ok: false as const, error: "Payload invalide pour creation de code." },
        { status: 400 }
      );
    }
    return await withMongoAuthDb(async ({ db }) => {
      await ensureAuthReady(db);
      const { codes } = authCollections(db);
      const now = new Date();
      await codes.insertOne({
        role,
        name,
        codeHash: sha256Hex(code),
        isActive: true,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
      });
      return NextResponse.json({ ok: true as const });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "admin_codes_create_failed";
    const status = typeof msg === "string" && msg.includes("duplicate key") ? 409 : 500;
    return status === 409
      ? NextResponse.json({ ok: false as const, error: "conflict" }, { status })
      : sanitizeErrorResponse("admin-auth-codes.POST", e, status);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminRole();
  if (!auth.ok) return auth.response;
  const oversized = ensureContentLengthWithin(req, 16 * 1024);
  if (oversized) return oversized;
  try {
    const body = (await req.json()) as UpdateBody;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { ok: false as const, error: "ID invalide." },
        { status: 400 }
      );
    }
    const role = body.role === undefined ? undefined : parseRole(body.role);
    if (body.role !== undefined && !role) {
      return NextResponse.json(
        { ok: false as const, error: "Role invalide." },
        { status: 400 }
      );
    }
    const name =
      body.name === undefined
        ? undefined
        : typeof body.name === "string"
          ? body.name.trim()
          : "";
    if (body.name !== undefined && name === "") {
      return NextResponse.json(
        { ok: false as const, error: "Nom invalide." },
        { status: 400 }
      );
    }
    const code =
      body.code === undefined
        ? undefined
        : typeof body.code === "string"
          ? body.code.trim()
          : "";
    if (body.code !== undefined && code === "") {
      return NextResponse.json(
        { ok: false as const, error: "Code invalide." },
        { status: 400 }
      );
    }
    if (code !== undefined && code.length > 256) {
      return NextResponse.json(
        { ok: false as const, error: "Code invalide." },
        { status: 400 }
      );
    }
    if (name !== undefined && name.length > 120) {
      return NextResponse.json(
        { ok: false as const, error: "Nom invalide." },
        { status: 400 }
      );
    }
    const expiresAt =
      body.expiresAt === undefined ? undefined : parseOptionalDate(body.expiresAt);
    if (expiresAt === undefined) {
      return NextResponse.json(
        { ok: false as const, error: "Date d expiration invalide." },
        { status: 400 }
      );
    }
    const isActive =
      body.isActive === undefined
        ? undefined
        : typeof body.isActive === "boolean"
          ? body.isActive
          : null;
    if (body.isActive !== undefined && isActive == null) {
      return NextResponse.json(
        { ok: false as const, error: "isActive invalide." },
        { status: 400 }
      );
    }

    return await withMongoAuthDb(async ({ db }) => {
      await ensureAuthReady(db);
      const { codes } = authCollections(db);
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (role !== undefined) update.role = role;
      if (name !== undefined) update.name = name;
      if (code !== undefined) update.codeHash = sha256Hex(code);
      if (expiresAt !== undefined) update.expiresAt = expiresAt;
      if (isActive !== undefined) update.isActive = isActive;

      await codes.updateOne({ _id: new ObjectId(id) }, { $set: update });
      return NextResponse.json({ ok: true as const });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "admin_codes_update_failed";
    const status = typeof msg === "string" && msg.includes("duplicate key") ? 409 : 500;
    return status === 409
      ? NextResponse.json({ ok: false as const, error: "conflict" }, { status })
      : sanitizeErrorResponse("admin-auth-codes.PATCH", e, status);
  }
}
