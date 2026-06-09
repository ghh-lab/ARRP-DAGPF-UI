import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { resolveRepoRoot } from "@/lib/repo-paths";

function resolveClassesFilePath(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "data", "classes_plantations_polynesie.json"),
    path.join(resolveRepoRoot(), "Public_Data", "classes_plantations_polynesie.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function GET() {
  try {
    const auth = await requireClientRole();
    if (!auth.ok) return auth.response;
    const p = resolveClassesFilePath();
    if (!p) {
      return NextResponse.json({ error: "classes_file_missing" }, { status: 404 });
    }
    const raw = fs.readFileSync(p, "utf-8");
    return new NextResponse(raw, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    return sanitizeErrorResponse("veg-classes.GET", e);
  }
}
