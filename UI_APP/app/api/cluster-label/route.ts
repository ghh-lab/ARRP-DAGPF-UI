import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { NextRequest, NextResponse } from "next/server";
import {
  requireAdminRoleStrict,
  requireClientRole,
  sanitizeErrorResponse,
} from "@/lib/api-security";
import {
  readClusterLabelsFile,
  writeClusterLabelsFile,
} from "@/lib/cluster-label-storage";
import type { ClusterLabelsFile } from "@/lib/cluster-label-types";
import {
  ensureManualColumn,
  rowManualVegLocked,
} from "@/lib/manual-veg-column";
import { jungleVectorsCsvPath, resolveRepoRoot } from "@/lib/repo-paths";

const VEG_COL = "veg_cat";
const CLUSTER_COL = "step2_cluster_id";

function rowClusterId(row: Record<string, string>): number | null {
  const raw = (row[CLUSTER_COL] ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseCsvRecords(content: string): {
  records: Record<string, string>[];
  columns: string[];
} {
  const bom = content.charCodeAt(0) === 0xfeff;
  const text = bom ? content.slice(1) : content;
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];
  if (records.length === 0) {
    return { records: [], columns: [] };
  }
  const columns: string[] = [...Object.keys(records[0])];
  const seen = new Set(columns);
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
  }
  return { records, columns };
}

function ensureVegColumn(
  records: Record<string, string>[],
  columns: string[]
): string[] {
  if (!columns.includes(VEG_COL)) {
    columns = [...columns, VEG_COL];
  }
  for (const r of records) {
    if (r[VEG_COL] === undefined) r[VEG_COL] = "";
  }
  return columns;
}

function applyVegCatToCluster(
  records: Record<string, string>[],
  clusterId: number,
  vegCat: number
): void {
  const val = String(vegCat);
  for (const r of records) {
    if (rowManualVegLocked(r)) continue;
    const cid = rowClusterId(r);
    if (cid === clusterId) r[VEG_COL] = val;
  }
}

function clearVegCatNonManualRows(records: Record<string, string>[]): void {
  for (const r of records) {
    if (rowManualVegLocked(r)) continue;
    r[VEG_COL] = "";
  }
}

function writeCsv(
  records: Record<string, string>[],
  columns: string[]
): void {
  const p = jungleVectorsCsvPath();
  const out = stringify(records, {
    header: true,
    columns,
  });
  fs.writeFileSync(p, out, "utf-8");
}

export async function GET() {
  try {
    const auth = await requireClientRole();
    if (!auth.ok) return auth.response;
    const data = readClusterLabelsFile();
    return NextResponse.json(data);
  } catch (e) {
    return sanitizeErrorResponse("cluster-label.GET", e);
  }
}

type PostBody = {
  clusterId: number;
  vegCat: number;
  displayName?: string;
};

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminRoleStrict();
    if (!auth.ok) return auth.response;
    const body = (await req.json()) as PostBody;
    const clusterId = Number(body.clusterId);
    const vegCat = Number(body.vegCat);
    if (
      !Number.isFinite(clusterId) ||
      !Number.isInteger(clusterId) ||
      clusterId < 0 ||
      clusterId > 1_000_000 ||
      !Number.isFinite(vegCat) ||
      !Number.isInteger(vegCat) ||
      vegCat < 0 ||
      vegCat > 10_000
    ) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const csvFile = jungleVectorsCsvPath();
    if (!fs.existsSync(csvFile)) {
      return NextResponse.json({ error: "csv_missing" }, { status: 404 });
    }

    const raw = fs.readFileSync(csvFile, "utf-8");
    const { records, columns: colsIn } = parseCsvRecords(raw);
    if (records.length === 0) {
      return NextResponse.json({ error: "csv_empty" }, { status: 400 });
    }
    let columns = ensureVegColumn(
      records,
      colsIn.length ? colsIn : Object.keys(records[0])
    );
    columns = ensureManualColumn(records, columns);
    applyVegCatToCluster(records, clusterId, vegCat);
    writeCsv(records, columns);

    const clsPath = path.join(
      resolveRepoRoot(),
      "Public_Data",
      "classes_plantations_polynesie.json"
    );
    let defaultName = "";
    if (fs.existsSync(clsPath)) {
      try {
        const jc = JSON.parse(fs.readFileSync(clsPath, "utf-8")) as {
          classes?: { code: number; nom: string }[];
        };
        const hit = jc.classes?.find((c) => c.code === vegCat);
        if (hit?.nom) defaultName = hit.nom;
      } catch {
        /* ignore */
      }
    }
    const displayName =
      typeof body.displayName === "string" && body.displayName.trim() !== ""
        ? body.displayName.trim().slice(0, 120)
        : defaultName || "Categorie " + String(vegCat);

    const labelsF = readClusterLabelsFile();
    const next: ClusterLabelsFile = {
      labels: {
        ...labelsF.labels,
        [String(clusterId)]: { vegCat, displayName },
      },
    };
    writeClusterLabelsFile(next);

    return NextResponse.json({ ok: true, clusterId, vegCat, displayName });
  } catch (e) {
    return sanitizeErrorResponse("cluster-label.POST", e);
  }
}

type PatchBody = {
  clusterId: number;
  displayName: string;
};

/**
 * Efface toutes les etiquettes (JSON) et vide veg_cat sur chaque ligne du CSV jungle.
 */
export async function DELETE() {
  try {
    const auth = await requireAdminRoleStrict();
    if (!auth.ok) return auth.response;
    const csvFile = jungleVectorsCsvPath();
    if (fs.existsSync(csvFile)) {
      const raw = fs.readFileSync(csvFile, "utf-8");
      const { records, columns: colsIn } = parseCsvRecords(raw);
      if (records.length > 0) {
        let columns = ensureVegColumn(
          records,
          colsIn.length ? colsIn : Object.keys(records[0])
        );
        columns = ensureManualColumn(records, columns);
        clearVegCatNonManualRows(records);
        writeCsv(records, columns);
      }
    }
    writeClusterLabelsFile({ labels: {} });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sanitizeErrorResponse("cluster-label.DELETE", e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdminRoleStrict();
    if (!auth.ok) return auth.response;
    const body = (await req.json()) as PatchBody;
    const clusterId = Number(body.clusterId);
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (
      !Number.isFinite(clusterId) ||
      !Number.isInteger(clusterId) ||
      clusterId < 0 ||
      clusterId > 1_000_000 ||
      displayName === "" ||
      displayName.length > 120
    ) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    const key = String(clusterId);
    const labelsF = readClusterLabelsFile();
    const cur = labelsF.labels[key];
    if (!cur) {
      return NextResponse.json(
        { error: "cluster_not_labeled" },
        { status: 400 }
      );
    }
    const next: ClusterLabelsFile = {
      labels: {
        ...labelsF.labels,
        [key]: { ...cur, displayName },
      },
    };
    writeClusterLabelsFile(next);
    return NextResponse.json({ ok: true, clusterId, displayName });
  } catch (e) {
    return sanitizeErrorResponse("cluster-label.PATCH", e);
  }
}
