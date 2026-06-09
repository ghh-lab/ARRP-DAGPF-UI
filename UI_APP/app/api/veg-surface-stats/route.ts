import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { VECTOR_CELL_SURFACE_HA } from "@/lib/cluster-types";
import { jungleVectorsCsvPath, resolveRepoRoot } from "@/lib/repo-paths";
import {
  compareSemesterKeys,
  labelForSemesterKey,
  semesterKeyFromRow,
} from "@/lib/semester-key";

const VEG_COL = "veg_cat";

/** Code veg_cat "Nuage" : exclu des courbes d'evolution par classe. */
const NUAGE_VEG_CODE = 21;
/** Code veg_cat "Jungle apparente" : exclu des courbes d'evolution par classe. */
const JUNGLE_APPARENTE_VEG_CODE = 19;

type Entry = {
  code: number;
  nom: string;
  cells: number;
  surfaceHa: number;
};

type PeriodAgg = {
  rowCount: number;
  nonEtiqueteCells: number;
  nonEtiqueteSurfaceHa: number;
  entries: Entry[];
};

type VegSemesterSlice = PeriodAgg & {
  key: string;
  label: string;
};

/** Somme des surface_ha des parcelles DAG (referentiel carte). */
function readDagTotalSurfaceHa(): number {
  const p = path.join(resolveRepoRoot(), "Public_Data", "DAG.16_07_2025.json");
  if (!fs.existsSync(p)) return 0;
  const raw = fs.readFileSync(p, "utf-8");
  const data = JSON.parse(raw) as unknown;
  let sum = 0;
  if (Array.isArray(data)) {
    for (const f of data as Array<{ surface_ha?: number }>) {
      const x = f.surface_ha;
      if (typeof x === "number" && Number.isFinite(x)) sum += x;
    }
  } else if (data && typeof data === "object" && "features" in (data as object)) {
    const feats = (data as { features?: Array<{ properties?: { surface_ha?: number } }> })
      .features;
    for (const f of feats ?? []) {
      const x = f.properties?.surface_ha;
      if (typeof x === "number" && Number.isFinite(x)) sum += x;
    }
  }
  return sum;
}

function aggregateVegForRows(
  rows: Record<string, string>[],
  nomByCode: Map<number, string>
): PeriodAgg {
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

export async function GET() {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const csvFile = jungleVectorsCsvPath();
  const classesFile = path.join(
    resolveRepoRoot(),
    "Public_Data",
    "classes_plantations_polynesie.json"
  );

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
    return sanitizeErrorResponse("veg-surface-stats.parseCsv", error);
  }

  const nomByCode = new Map<number, string>();
  if (fs.existsSync(classesFile)) {
    try {
      const jc = JSON.parse(fs.readFileSync(classesFile, "utf-8")) as {
        classes?: { code: number; nom: string }[];
      };
      for (const c of jc.classes ?? []) {
        nomByCode.set(c.code, c.nom);
      }
    } catch {
      /* ignore */
    }
  }

  const buckets = new Map<string, Record<string, string>[]>();
  let unknownSemesterRows = 0;

  for (const row of records) {
    const k = semesterKeyFromRow(row);
    if (!k) {
      unknownSemesterRows += 1;
      continue;
    }
    let arr = buckets.get(k);
    if (!arr) {
      arr = [];
      buckets.set(k, arr);
    }
    arr.push(row);
  }

  const vegCatBySemester: VegSemesterSlice[] = Array.from(buckets.entries())
    .map(([key, rows]) => ({
      key,
      label: labelForSemesterKey(key),
      ...aggregateVegForRows(rows, nomByCode),
    }))
    .sort((a, b) => compareSemesterKeys(a.key, b.key));

  const evoBySemesterCode = new Map<string, Map<number, number>>();
  for (const row of records) {
    const sk = semesterKeyFromRow(row);
    if (!sk) continue;
    const v = (row[VEG_COL] ?? "").trim();
    if (v === "") continue;
    const code = Number.parseInt(v, 10);
    if (!Number.isFinite(code)) continue;
    if (code === NUAGE_VEG_CODE || code === JUNGLE_APPARENTE_VEG_CODE) continue;

    let byCode = evoBySemesterCode.get(sk);
    if (!byCode) {
      byCode = new Map();
      evoBySemesterCode.set(sk, byCode);
    }
    byCode.set(
      code,
      (byCode.get(code) ?? 0) + VECTOR_CELL_SURFACE_HA
    );
  }

  const allCodes = new Set<number>();
  for (const m of evoBySemesterCode.values()) {
    for (const c of m.keys()) {
      allCodes.add(c);
    }
  }
  const sortedCodes = Array.from(allCodes).sort((a, b) => a - b);

  const evolutionLines =
    sortedCodes.length === 0
      ? []
      : sortedCodes.map((code) => ({
          code,
          nom: nomByCode.get(code) ?? "Code " + String(code),
        }));

  const semestersChrono = Array.from(evoBySemesterCode.keys()).sort(
    (a, b) => compareSemesterKeys(b, a)
  );

  const evolutionBySemester =
    sortedCodes.length === 0
      ? []
      : semestersChrono.map((sk) => {
          const m = evoBySemesterCode.get(sk);
          const row: Record<string, string | number> = {
            semesterKey: sk,
            semesterLabel: labelForSemesterKey(sk),
          };
          for (const code of sortedCodes) {
            row[String(code)] = m?.get(code) ?? 0;
          }
          return row;
        });

  const totalRows = records.length;
  const totalSurfaceHa = totalRows * VECTOR_CELL_SURFACE_HA;
  const dagTotalSurfaceHa = readDagTotalSurfaceHa();

  const payload = {
    cellSurfaceHa: VECTOR_CELL_SURFACE_HA,
    totalRows,
    totalSurfaceHa,
    dagTotalSurfaceHa,
    unknownSemesterRows,
    vegCatBySemester,
    evolutionBySemester,
    evolutionLines,
  };

  return NextResponse.json(payload);
}
