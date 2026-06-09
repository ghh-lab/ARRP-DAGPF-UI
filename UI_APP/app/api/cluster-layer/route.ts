import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { buildClusterLayerFromFiles } from "@/lib/cluster-layer-from-csv";
import { jungleVectorsCsvPath, resolveRepoRoot } from "@/lib/repo-paths";

export const dynamic = "force-dynamic";

function dagPathSpatialCheck(): string {
  const root = resolveRepoRoot();
  const dataPath = path.join(root, "DATA", "DAG.16_07_2025.json");
  if (fs.existsSync(dataPath)) return dataPath;
  return path.join(root, "Public_Data", "DAG.16_07_2025.json");
}

let cache: {
  csvMtimeMs: number;
  dagMtimeMs: number;
  csvPath: string;
  dagPath: string;
  body: string;
} | null = null;

export async function GET() {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  try {
    const csvPath = jungleVectorsCsvPath();
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: "csv_missing" }, { status: 404 });
    }
    const dagPath = dagPathSpatialCheck();
    const stCsv = fs.statSync(csvPath);
    const stDag = fs.existsSync(dagPath) ? fs.statSync(dagPath) : null;

    if (
      cache &&
      cache.csvPath === csvPath &&
      cache.dagPath === dagPath &&
      cache.csvMtimeMs === stCsv.mtimeMs &&
      cache.dagMtimeMs === (stDag ? stDag.mtimeMs : -1)
    ) {
      return new NextResponse(cache.body, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const payload = buildClusterLayerFromFiles(csvPath, dagPath);
    const bodyObj = {
      ranking: payload.ranking,
      geojson: payload.geojson,
      rowsUsed: payload.rowsUsed,
      rowsSkipped: payload.rowsSkipped,
    };
    const body = JSON.stringify(bodyObj);
    cache = {
      csvMtimeMs: stCsv.mtimeMs,
      dagMtimeMs: stDag ? stDag.mtimeMs : -1,
      csvPath,
      dagPath,
      body,
    };

    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return sanitizeErrorResponse("cluster-layer.GET", error);
  }
}
