import fs from "fs";
import { parse } from "csv-parse/sync";
import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { VECTOR_CELL_SURFACE_HA } from "@/lib/cluster-types";
import { jungleVectorsCsvPath } from "@/lib/repo-paths";

const VEG_COL = "veg_cat";
const DATE_COL = "acquisition_date";

/** veg_cat "Abris / maison" (classes_plantations_polynesie.json). */
const MAISON_ABRIS_CODE = 20;

function compareIsoDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export async function GET() {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const csvFile = jungleVectorsCsvPath();

  if (!fs.existsSync(csvFile)) {
    return NextResponse.json({ error: "csv_missing" }, { status: 404 });
  }

  let records: Record<string, string>[] = [];
  try {
    const raw = fs.readFileSync(csvFile, "utf-8");
    const bom = raw.charCodeAt(0) === 0xfeff;
    const text = bom ? raw.slice(1) : raw;
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
    }) as Record<string, string>[];
  } catch (error) {
    return sanitizeErrorResponse("parcel-abris-latest.parseCsv", error);
  }

  let latest = "";
  for (const row of records) {
    const d = (row[DATE_COL] ?? "").trim();
    if (d.length === 0) continue;
    if (latest === "" || compareIsoDates(d, latest) > 0) latest = d;
  }

  if (latest === "") {
    return NextResponse.json({
      latestAcquisitionDate: "",
      cellSurfaceHa: VECTOR_CELL_SURFACE_HA,
      totalMaillesMaisonAbris: 0,
      surfaceHaMaisonAbris: 0,
    });
  }

  let totalMaillesMaisonAbris = 0;
  for (const row of records) {
    const d = (row[DATE_COL] ?? "").trim();
    if (d !== latest) continue;

    const v = (row[VEG_COL] ?? "").trim();
    if (v === "") continue;
    const code = Number.parseInt(v, 10);
    if (!Number.isFinite(code) || code !== MAISON_ABRIS_CODE) continue;

    totalMaillesMaisonAbris += 1;
  }

  const surfaceHaMaisonAbris =
    totalMaillesMaisonAbris * VECTOR_CELL_SURFACE_HA;

  return NextResponse.json({
    latestAcquisitionDate: latest,
    cellSurfaceHa: VECTOR_CELL_SURFACE_HA,
    totalMaillesMaisonAbris,
    surfaceHaMaisonAbris,
  });
}
