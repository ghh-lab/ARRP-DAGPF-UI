import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { resolveRepoRoot } from "@/lib/repo-paths";

export const dynamic = "force-dynamic";

function findConfusionMatrixPath(repoRoot: string): string | null {
  const bestPath = path.join(
    repoRoot,
    "Backend",
    "5_final_model",
    "output",
    "best",
    "confusion_matrix.png"
  );
  if (fs.existsSync(bestPath)) return bestPath;

  const outputDir = path.join(repoRoot, "Backend", "5_final_model", "output");
  const runMetaPath = path.join(outputDir, "best", "run_meta.json");
  if (fs.existsSync(runMetaPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(runMetaPath, "utf-8")) as {
        run_id?: number;
      };
      const runId = Number(j.run_id);
      if (Number.isFinite(runId) && runId > 0) {
        const runPath = path.join(
          outputDir,
          "run_" + String(Math.trunc(runId)),
          "confusion_matrix.png"
        );
        if (fs.existsSync(runPath)) return runPath;
      }
    } catch {
      // ignore and fallback to null
    }
  }

  return null;
}

export async function GET() {
  try {
    const auth = await requireClientRole();
    if (!auth.ok) return auth.response;
    const repoRoot = resolveRepoRoot();
    const cmPath = findConfusionMatrixPath(repoRoot);
    if (!cmPath) {
      return NextResponse.json(
        { error: "confusion_matrix_not_found" },
        { status: 404 }
      );
    }
    const buf = fs.readFileSync(cmPath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return sanitizeErrorResponse("model-confusion-matrix.GET", e);
  }
}
