import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { getSharedMongoClient } from "@/lib/mongo-client-pool";
import { loadVegCatNomByCode } from "@/lib/parcel-csv-manual-veg-override";
import { resolveRepoRoot } from "@/lib/repo-paths";
import {
  mongoAiCollectionName,
  mongoDbName,
  mongoStacCollectionName,
  mongoUri,
} from "@/lib/runtime-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DagRow = {
  _id?: unknown;
  dag_feature_id?: unknown;
  parcel_id?: unknown;
  num_lot?: unknown;
  commune?: unknown;
  surface_ha?: unknown;
  geometry?: unknown;
};

type AggRow = {
  parcelId?: unknown;
  stacDate?: unknown;
  categoryId?: unknown;
  categoryName?: unknown;
  vectors?: unknown;
};

function readJsonIfExists<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseCategoryId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseRatioUnit(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseFiniteNumber(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function allocateIntegerPercentages(
  rows: Array<{ type: string; vectors: number }>
): Array<{ type: string; vectors: number; percent: number }> {
  const total = rows.reduce((acc, r) => acc + r.vectors, 0);
  if (total <= 0) {
    return rows.map((r) => ({ ...r, percent: 0 }));
  }
  const raw = rows.map((r, idx) => ({
    idx,
    type: r.type,
    vectors: r.vectors,
    exact: (r.vectors * 100) / total,
  }));
  const floored = raw.map((r) => ({
    ...r,
    percent: Math.floor(r.exact),
    frac: r.exact - Math.floor(r.exact),
  }));
  let remain = 100 - floored.reduce((acc, r) => acc + r.percent, 0);
  floored.sort((a, b) => b.frac - a.frac || b.vectors - a.vectors || a.idx - b.idx);
  for (let i = 0; i < floored.length && remain > 0; i += 1) {
    floored[i]!.percent += 1;
    remain -= 1;
  }
  floored.sort((a, b) => a.idx - b.idx);
  return floored.map((r) => ({
    type: r.type,
    vectors: r.vectors,
    percent: r.percent,
  }));
}

/**
 * Exporte un JSON de repartition des types de vecteurs par parcelle puis par date STAC.
 * Priorite de classe: manuel puis modele.
 */
export async function GET() {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const repoRoot = resolveRepoRoot();
  const dagPath = path.join(repoRoot, "Public_Data", "DAG.16_07_2025.json");
  const downloadedAt = new Date();
  const downloadedAtIso = downloadedAt.toISOString();
  const downloadedAtCompact = downloadedAtIso
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "_");

  const dagRows = readJsonIfExists<DagRow[]>(dagPath);
  if (!dagRows) {
    return NextResponse.json(
      { error: "dag_file_missing_or_invalid" },
      { status: 404 }
    );
  }

  const parcelIds = new Set<string>();
  const parcelIdToCanonical = new Map<string, string>();
  const dagParcels: Array<{
    parcel_key: string;
    dag_feature_id: string | null;
    parcel_id: number | null;
    num_lot: string | null;
    commune: string | null;
    surface_ha: number | null;
    geojson: {
      type: "Feature";
      geometry: unknown;
      properties: Record<string, unknown>;
    } | null;
  }> = [];
  const seenCanonical = new Set<string>();
  for (const row of dagRows) {
    const a = normalizeString(row._id);
    const b = normalizeString(row.dag_feature_id);
    const canonical = a !== "" ? a : b;
    if (a !== "") parcelIds.add(a);
    if (b !== "") parcelIds.add(b);
    if (a !== "") parcelIdToCanonical.set(a, canonical);
    if (b !== "") parcelIdToCanonical.set(b, canonical);
    if (canonical === "" || seenCanonical.has(canonical)) continue;
    seenCanonical.add(canonical);
    dagParcels.push({
      parcel_key: canonical,
      dag_feature_id: a !== "" ? a : b !== "" ? b : null,
      parcel_id: parseFiniteNumber(row.parcel_id),
      num_lot: normalizeString(row.num_lot) || null,
      commune: normalizeString(row.commune) || null,
      surface_ha: parseFiniteNumber(row.surface_ha),
      geojson:
        row.geometry != null
          ? {
              type: "Feature",
              geometry: row.geometry,
              properties: {
                parcel_key: canonical,
                dag_feature_id: a !== "" ? a : b !== "" ? b : null,
                parcel_id: parseFiniteNumber(row.parcel_id),
                num_lot: normalizeString(row.num_lot) || null,
                commune: normalizeString(row.commune) || null,
                surface_ha: parseFiniteNumber(row.surface_ha),
              },
            }
          : null,
    });
  }
  if (parcelIds.size === 0) {
    return NextResponse.json({ error: "dag_has_no_parcel_ids" }, { status: 400 });
  }

  const metrics = readJsonIfExists<Record<string, unknown>>(
    path.join(repoRoot, "Backend", "5_final_model", "output", "best", "metrics.json")
  );
  const runMeta = readJsonIfExists<Record<string, unknown>>(
    path.join(repoRoot, "Backend", "5_final_model", "output", "best", "run_meta.json")
  );
  const sourceRunTextPath = path.join(
    repoRoot,
    "Backend",
    "5_final_model",
    "output",
    "best",
    "best_source_run.txt"
  );
  const sourceRunText = fs.existsSync(sourceRunTextPath)
    ? fs.readFileSync(sourceRunTextPath, "utf-8").trim()
    : "";

  const uri = mongoUri();
  const dbName = mongoDbName();
  const collName = mongoAiCollectionName();
  const stacCollName = mongoStacCollectionName();

  try {
    const client = await getSharedMongoClient(uri);
    const coll = client.db(dbName).collection(collName);
    const nomByCode = loadVegCatNomByCode();

    const aggRows = await coll
      .aggregate<AggRow>([
        {
          $addFields: {
            effCategoryId: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$Agriculture.Manual.is_set", true] },
                    { $ne: ["$Agriculture.Manual.category_id", null] },
                  ],
                },
                "$Agriculture.Manual.category_id",
                {
                  $ifNull: [
                    "$Agriculture.Model.category_id",
                    "$Agriculture.category_id",
                  ],
                },
              ],
            },
            effCategoryName: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$Agriculture.Manual.is_set", true] },
                    { $ne: ["$Agriculture.Manual.category_id", null] },
                  ],
                },
                {
                  $ifNull: [
                    "$Agriculture.Manual.category_name",
                    {
                      $ifNull: [
                        "$Agriculture.Model.category_name",
                        "$Agriculture.category_name",
                      ],
                    },
                  ],
                },
                {
                  $ifNull: [
                    "$Agriculture.Model.category_name",
                    "$Agriculture.category_name",
                  ],
                },
              ],
            },
            effParcelId: {
              $ifNull: ["$dag_feature_id", "$Agriculture.dag_feature_id"],
            },
          },
        },
        {
          $addFields: {
            effParcelIdStr: {
              $cond: [
                { $ne: ["$effParcelId", null] },
                { $toString: "$effParcelId" },
                "",
              ],
            },
          },
        },
        {
          $match: {
            effParcelIdStr: { $in: Array.from(parcelIds) },
            effCategoryId: { $ne: null },
          },
        },
        {
          $lookup: {
            from: stacCollName,
            localField: "stac_id",
            foreignField: "id",
            as: "_stHit",
          },
        },
        {
          $addFields: {
            stacDoc: { $arrayElemAt: ["$_stHit", 0] },
          },
        },
        {
          $addFields: {
            effDateIso: {
              $ifNull: [
                "$stacDoc.properties.datetime",
                {
                  $ifNull: [
                    "$acquisition_date",
                    {
                      $ifNull: [
                        "$stac_datetime",
                        {
                          $ifNull: [
                            "$datetime",
                            {
                              $ifNull: [
                                "$vl_acquisition_timestamp",
                                "$acquisition_timestamp",
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          $addFields: {
            effDateObj: {
              $dateFromString: {
                dateString: "$effDateIso",
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $match: {
            effDateObj: { $ne: null },
          },
        },
        {
          $addFields: {
            stacDate: {
              $dateToString: { format: "%Y-%m-%d", date: "$effDateObj" },
            },
          },
        },
        {
          $group: {
            _id: {
              parcelId: "$effParcelIdStr",
              stacDate: "$stacDate",
              categoryId: "$effCategoryId",
              categoryName: "$effCategoryName",
            },
            vectors: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            parcelId: "$_id.parcelId",
            stacDate: "$_id.stacDate",
            categoryId: "$_id.categoryId",
            categoryName: "$_id.categoryName",
            vectors: 1,
          },
        },
        {
          $sort: { parcelId: 1, stacDate: 1, vectors: -1 },
        },
      ])
      .toArray();

    const byParcelThenDate = new Map<
      string,
      Map<string, Array<{ type: string; vectors: number }>>
    >();
    for (const r of aggRows) {
      const rawParcelId = normalizeString(r.parcelId);
      const canonicalParcelId = parcelIdToCanonical.get(rawParcelId) ?? rawParcelId;
      if (canonicalParcelId === "") continue;
      const stacDate = normalizeString(r.stacDate);
      if (stacDate === "") continue;
      const categoryId = parseCategoryId(r.categoryId);
      const rawName = normalizeString(r.categoryName);
      const fromCode = categoryId != null ? normalizeString(nomByCode.get(categoryId)) : "";
      const type =
        fromCode !== ""
          ? fromCode
          : rawName !== ""
            ? rawName
            : categoryId != null
              ? "Code " + String(categoryId)
              : "Inconnu";
      const vectors =
        typeof r.vectors === "number" && Number.isFinite(r.vectors) ? r.vectors : 0;
      if (vectors <= 0) continue;
      const dateMap = byParcelThenDate.get(canonicalParcelId) ?? new Map();
      const slot = dateMap.get(stacDate) ?? [];
      slot.push({ type, vectors });
      dateMap.set(stacDate, slot);
      byParcelThenDate.set(canonicalParcelId, dateMap);
    }

    const parcels = dagParcels.map((p) => {
      const byDate = byParcelThenDate.get(p.parcel_key) ?? new Map();
      const stac_dates = Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([stacDate, rows]) => {
          const grouped = new Map<string, number>();
          for (const r of rows) {
            grouped.set(r.type, (grouped.get(r.type) ?? 0) + r.vectors);
          }
          const merged = Array.from(grouped.entries()).map(([type, vectors]) => ({
            type,
            vectors,
          }));
          const totalVectors = merged.reduce((acc, r) => acc + r.vectors, 0);
          const distribution = allocateIntegerPercentages(
            merged.sort((a, b) => b.vectors - a.vectors || a.type.localeCompare(b.type, "fr"))
          );
          return {
            stac_date: stacDate,
            total_vectors: totalVectors,
            repartition_percent_int: distribution.map((d) => ({
              type_vecteur: d.type,
              pourcentage: d.percent,
              vectors: d.vectors,
            })),
          };
        });
      return {
        parcel_key: p.parcel_key,
        dag_feature_id: p.dag_feature_id,
        parcel_id: p.parcel_id,
        num_lot: p.num_lot,
        commune: p.commune,
        surface_ha: p.surface_ha,
        geojson: p.geojson,
        stac_dates,
      };
    });
    const parcelsWithData = parcels.filter((p) => p.stac_dates.length > 0).length;

    const version =
      Number.isFinite(Number(runMeta?.run_id)) ? Number(runMeta?.run_id) : null;
    const accuracyUnit = parseRatioUnit(metrics?.accuracy);
    const macroF1Unit = parseRatioUnit(metrics?.macro_f1);
    const nGridPoints = Number.isFinite(Number(runMeta?.n_grid_points))
      ? Number(runMeta?.n_grid_points)
      : null;

    const fileBase = `DAG_16_07_2025_STAC_repartition_par_parcelle_${downloadedAtCompact}${
      version != null ? `_v${String(version)}` : ""
    }.geojson`;
    const featureCollection = {
      type: "FeatureCollection" as const,
      title: downloadedAtIso,
      downloaded_at: downloadedAtIso,
      source: {
        dag_file: "Public_Data/DAG.16_07_2025.json",
        parcels_count: dagParcels.length,
        parcels_with_data: parcelsWithData,
      },
      model_info: {
        version_run_id: version,
        accuracy_percent: accuracyUnit != null ? Math.round(accuracyUnit * 100) : null,
        macro_f1_percent: macroF1Unit != null ? Math.round(macroF1Unit * 100) : null,
        grid_points: nGridPoints,
        source_run: sourceRunText !== "" ? sourceRunText : null,
      },
      features: parcels.map((p) => ({
        type: "Feature" as const,
        geometry: p.geojson?.geometry ?? null,
        properties: {
          parcel_key: p.parcel_key,
          dag_feature_id: p.dag_feature_id,
          parcel_id: p.parcel_id,
          num_lot: p.num_lot,
          commune: p.commune,
          surface_ha: p.surface_ha,
          stac_dates: p.stac_dates,
        },
      })),
    };

    return new NextResponse(JSON.stringify(featureCollection, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}"`,
      },
    });
  } catch (e) {
    return sanitizeErrorResponse("export-vectors-csv.GET", e);
  }
}
