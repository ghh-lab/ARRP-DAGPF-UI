import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { resolveRepoRoot } from "@/lib/repo-paths";

const EXTRA_COLS = ["veg_cat_nom", "veg_cat_manual_nom"] as const;

export type BuildVectorsResult =
  | { ok: true; csv: string }
  | {
      ok: false;
      code: "vectors_missing" | "classes_missing" | "empty_csv";
      path?: string;
    };

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function parseIntCell(s: string | undefined): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseBoolCell(s: string | undefined): boolean {
  const t = (s ?? "").trim().toLowerCase();
  return t === "true" || t === "1" || t === "yes";
}

function parseRecords(content: string): {
  records: Record<string, string>[];
  columns: string[];
} {
  const text = stripBom(content);
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

function loadNomMap(repoRoot: string): Map<number, string> {
  const p = path.join(repoRoot, "Public_Data", "classes_plantations_polynesie.json");
  const raw = fs.readFileSync(p, "utf-8");
  const data = JSON.parse(raw) as { classes?: { code?: number; nom?: string }[] };
  const m = new Map<number, string>();
  for (const c of data.classes ?? []) {
    if (typeof c.code === "number" && typeof c.nom === "string") {
      m.set(c.code, c.nom);
    }
  }
  return m;
}

/**
 * Reads vectors CSV and classes JSON, returns CSV text with veg_cat_nom and veg_cat_manual_nom.
 */
export function buildVectorsCsvWithCategoryNames(vectorsPath: string): BuildVectorsResult {
  if (!fs.existsSync(vectorsPath)) {
    return { ok: false, code: "vectors_missing", path: vectorsPath };
  }
  const repoRoot = resolveRepoRoot();
  const classesPath = path.join(repoRoot, "Public_Data", "classes_plantations_polynesie.json");
  if (!fs.existsSync(classesPath)) {
    return { ok: false, code: "classes_missing", path: classesPath };
  }

  const content = fs.readFileSync(vectorsPath, "utf-8");
  const { records, columns } = parseRecords(content);
  if (records.length === 0) {
    return { ok: false, code: "empty_csv" };
  }

  const nomMap = loadNomMap(repoRoot);
  const fieldnames = [...columns];
  for (const c of EXTRA_COLS) {
    if (!fieldnames.includes(c)) {
      fieldnames.push(c);
    }
  }

  for (const row of records) {
    const vc = parseIntCell(row["veg_cat"]);
    const vm = parseIntCell(row["veg_cat_manual"]);
    const manualFlag = parseBoolCell(row["veg_cat_manual"]);
    const manualCode = vm != null ? vm : manualFlag ? vc : null;
    row["veg_cat_nom"] =
      vc != null && nomMap.has(vc) ? (nomMap.get(vc) as string) : "";
    row["veg_cat_manual_nom"] =
      manualCode != null && nomMap.has(manualCode)
        ? (nomMap.get(manualCode) as string)
        : "";
  }

  const csv = stringify(records, {
    header: true,
    columns: fieldnames,
  });
  return { ok: true, csv };
}
