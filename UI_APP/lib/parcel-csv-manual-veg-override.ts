import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import type { MultiPolygon, Polygon } from "geojson";
import { pointInGeom } from "@/lib/cluster-layer-from-csv";
import { mailleCenterKey } from "@/lib/manual-maille-selection";
import { rowManualVegLocked } from "@/lib/manual-veg-column";
import { compareSemesterKeys, semesterKeyFromRow } from "@/lib/semester-key";
import { resolveRepoRoot } from "@/lib/repo-paths";

const VEG_COL = "veg_cat";

export type ManualVegOverride = {
  code: number;
  name: string;
};

/**
 * Noms des codes veg_cat depuis classes_plantations_polynesie.json (meme source que parcel-veg-pie).
 */
export function loadVegCatNomByCode(): Map<number, string> {
  const nomByCode = new Map<number, string>();
  const candidates = [
    path.join(process.cwd(), "public", "data", "classes_plantations_polynesie.json"),
    path.join(resolveRepoRoot(), "Public_Data", "classes_plantations_polynesie.json"),
  ];
  for (const classesFile of candidates) {
    if (!fs.existsSync(classesFile)) continue;
    try {
      const jc = JSON.parse(fs.readFileSync(classesFile, "utf-8")) as {
        classes?: { code: number; nom: string }[];
      };
      for (const c of jc.classes ?? []) {
        nomByCode.set(c.code, c.nom);
      }
      break;
    } catch {
      /* try next candidate */
    }
  }
  return nomByCode;
}

export function parseJungleVectorsCsvRecords(content: string): Record<string, string>[] {
  const bom = content.charCodeAt(0) === 0xfeff;
  const text = bom ? content.slice(1) : content;
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];
  return records;
}

function semBetter(newSk: string, oldSk: string): boolean {
  if (newSk && !oldSk) return true;
  if (!newSk && oldSk) return false;
  if (!newSk && !oldSk) return false;
  return compareSemesterKeys(newSk, oldSk) < 0;
}

/**
 * Pour chaque centre maille (cle = mailleCenterKey), veg_cat manuel prioritaire si plusieurs lignes.
 */
export function buildManualVegCatByMailleKey(
  geom: Polygon | MultiPolygon,
  records: Record<string, string>[],
  nomByCode: Map<number, string>
): Map<string, ManualVegOverride> {
  type Cand = { code: number; name: string; semesterKey: string };
  const best = new Map<string, Cand>();

  for (const row of records) {
    if (!rowManualVegLocked(row)) continue;
    const v = (row[VEG_COL] ?? "").trim();
    if (v === "") continue;
    const code = Number.parseInt(v, 10);
    if (!Number.isFinite(code)) continue;

    const rawLon = (row.step2_vector_lon ?? "").trim();
    const rawLat = (row.step2_vector_lat ?? "").trim();
    if (rawLon === "" || rawLat === "") continue;
    const lon = Number.parseFloat(rawLon);
    const lat = Number.parseFloat(rawLat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (!pointInGeom(lon, lat, geom)) continue;

    const key = mailleCenterKey(lon, lat);
    const sk = semesterKeyFromRow(row) ?? "";
    const name = nomByCode.get(code) ?? "Code " + String(code);

    const prev = best.get(key);
    if (!prev) {
      best.set(key, { code, name, semesterKey: sk });
      continue;
    }
    if (semBetter(sk, prev.semesterKey)) {
      best.set(key, { code, name, semesterKey: sk });
    }
  }

  const out = new Map<string, ManualVegOverride>();
  for (const [k, v] of best) {
    out.set(k, { code: v.code, name: v.name });
  }
  return out;
}
