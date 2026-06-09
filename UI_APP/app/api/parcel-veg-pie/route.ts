import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { NextResponse } from "next/server";
import {
  ensureContentLengthWithin,
  requireClientRole,
  sanitizeErrorResponse,
} from "@/lib/api-security";
import { pointInGeom } from "@/lib/cluster-layer-from-csv";
import { VECTOR_CELL_SURFACE_HA } from "@/lib/cluster-types";
import { jungleVectorsCsvPath, resolveRepoRoot } from "@/lib/repo-paths";
import {
  labelForSemesterKey,
  semesterKeyFromIsoDatetime,
  semesterKeyFromRow,
} from "@/lib/semester-key";

export const dynamic = "force-dynamic";

const VEG_COL = "veg_cat";

type Entry = {
  code: number;
  nom: string;
  cells: number;
  surfaceHa: number;
};

function aggregateVegForRows(
  rows: Record<string, string>[],
  nomByCode: Map<number, string>
): {
  rowCount: number;
  nonEtiqueteCells: number;
  nonEtiqueteSurfaceHa: number;
  entries: Entry[];
} {
  const counts = new Map<number, number>();
  let nonEtiquete = 0;
  for (const row of rows) {
    const v = (row[VEG_COL] ?? "").trim();
    if (v === "") {
      nonEtiquete += 1;
      continue;
    }
    const code = Number.parseInt(v, 10);
    if (!Number.isFinite(code)) {
      nonEtiquete += 1;
      continue;
    }
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const entries: Entry[] = Array.from(counts.entries())
    .map(([code, cells]) => ({
      code,
      nom: nomByCode.get(code) ?? "Code " + String(code),
      cells,
      surfaceHa: cells * VECTOR_CELL_SURFACE_HA,
    }))
    .sort((a, b) => b.surfaceHa - a.surfaceHa);

  return {
    rowCount: rows.length,
    nonEtiqueteCells: nonEtiquete,
    nonEtiqueteSurfaceHa: nonEtiquete * VECTOR_CELL_SURFACE_HA,
    entries,
  };
}

function isGeom(o: unknown): o is { type: string; coordinates?: unknown } {
  return (
    typeof o === "object" &&
    o !== null &&
    "type" in o &&
    typeof (o as { type: unknown }).type === "string"
  );
}

export async function POST(request: Request) {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const oversized = ensureContentLengthWithin(request, 256 * 1024);
  if (oversized) return oversized;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "body_required" }, { status: 400 });
  }

  const b = body as { geometry?: unknown; datetime?: unknown };
  const geometry = b.geometry;
  const datetime =
    typeof b.datetime === "string" ? b.datetime.trim() : null;

  if (!isGeom(geometry)) {
    return NextResponse.json({ error: "geometry_required" }, { status: 400 });
  }
  if (JSON.stringify(geometry).length > 200_000) {
    return NextResponse.json({ error: "geometry_too_large" }, { status: 400 });
  }
  if (!datetime) {
    return NextResponse.json({ error: "datetime_required" }, { status: 400 });
  }

  const periodKey = semesterKeyFromIsoDatetime(datetime);
  if (!periodKey) {
    return NextResponse.json(
      {
        error: "datetime_unparsed",
        semesterKey: null,
        semesterLabel: "",
        cellSurfaceHa: VECTOR_CELL_SURFACE_HA,
        rowsInPeriod: 0,
        rowsInsideParcel: 0,
        entries: [] as Entry[],
        nonEtiqueteCells: 0,
        nonEtiqueteSurfaceHa: 0,
      },
      { status: 200 }
    );
  }

  const csvFile = jungleVectorsCsvPath();
  const classesFile = path.join(
    resolveRepoRoot(),
    "Public_Data",
    "classes_plantations_polynesie.json"
  );

  if (!fs.existsSync(csvFile)) {
    return NextResponse.json({ error: "csv_missing" }, { status: 404 });
  }

  const nomByCode = new Map<number, string>();
  if (fs.existsSync(classesFile)) {
    try {
      const jc = JSON.parse(
        fs.readFileSync(classesFile, "utf-8")
      ) as {
        classes?: { code: number; nom: string }[];
      };
      for (const c of jc.classes ?? []) {
        nomByCode.set(c.code, c.nom);
      }
    } catch {
      /* ignore */
    }
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
    return sanitizeErrorResponse("parcel-veg-pie.parseCsv", error);
  }

  let rowsInPeriod = 0;
  const insideParcel: Record<string, string>[] = [];

  for (const row of records) {
    const sk = semesterKeyFromRow(row);
    if (sk !== periodKey) continue;
    rowsInPeriod += 1;

    const rawLon = (row.step2_vector_lon ?? "").trim();
    const rawLat = (row.step2_vector_lat ?? "").trim();
    if (rawLon === "" || rawLat === "") continue;
    const lon = Number.parseFloat(rawLon);
    const lat = Number.parseFloat(rawLat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    if (!pointInGeom(lon, lat, geometry)) continue;
    insideParcel.push(row);
  }

  const agg = aggregateVegForRows(insideParcel, nomByCode);

  return NextResponse.json({
    semesterKey: periodKey,
    semesterLabel: labelForSemesterKey(periodKey),
    stacDatetime: datetime,
    cellSurfaceHa: VECTOR_CELL_SURFACE_HA,
    rowsInPeriod,
    rowsInsideParcel: insideParcel.length,
    entries: agg.entries,
    nonEtiqueteCells: agg.nonEtiqueteCells,
    nonEtiqueteSurfaceHa: agg.nonEtiqueteSurfaceHa,
  });
}
