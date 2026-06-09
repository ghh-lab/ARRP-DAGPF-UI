import fs from "fs";
import path from "path";
import type { FeatureCollection } from "geojson";
import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { getSharedMongoClient } from "@/lib/mongo-client-pool";
import { loadVegCatNomByCode } from "@/lib/parcel-csv-manual-veg-override";
import { resolveRepoRoot } from "@/lib/repo-paths";
import { mongoAiCollectionName, mongoDbName, mongoUri } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ParcelTopCategoryRow = {
  _id?: unknown;
  categoryId?: unknown;
  categoryName?: unknown;
  vectors?: unknown;
};

function parcelsGeojsonPath(): string {
  const candidates = [
    path.join(process.cwd(), "public", "data", "parcels.geojson"),
    path.join(resolveRepoRoot(), "UI_APP", "public", "data", "parcels.geojson"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function readBaseGeojson(): FeatureCollection {
  const raw = fs.readFileSync(parcelsGeojsonPath(), "utf-8");
  return JSON.parse(raw) as FeatureCollection;
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

export async function GET() {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const uri = mongoUri();
  const dbName = mongoDbName();
  const collName = mongoAiCollectionName();

  let geojson: FeatureCollection;
  try {
    geojson = readBaseGeojson();
  } catch (e) {
    return sanitizeErrorResponse("parcels-geojson.readBase", e);
  }

  try {
    const client = await getSharedMongoClient(uri);
    const coll = client.db(dbName).collection(collName);
    const nomByCode = loadVegCatNomByCode();

    const rows = await coll
      .aggregate<ParcelTopCategoryRow>([
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
            effParcelIdStr: { $ne: "" },
            effCategoryId: { $ne: null },
          },
        },
        {
          $group: {
            _id: {
              parcelId: "$effParcelIdStr",
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
            categoryId: "$_id.categoryId",
            categoryName: "$_id.categoryName",
            vectors: 1,
          },
        },
        {
          $sort: {
            parcelId: 1,
            vectors: -1,
            categoryId: 1,
          },
        },
        {
          $group: {
            _id: "$parcelId",
            top: { $first: "$$ROOT" },
          },
        },
        {
          $project: {
            _id: 1,
            categoryId: "$top.categoryId",
            categoryName: "$top.categoryName",
            vectors: "$top.vectors",
          },
        },
      ])
      .toArray();

    const byParcelId = new Map<
      string,
      { categoryName: string; categoryId: number | null; vectors: number }
    >();
    for (const r of rows) {
      const parcelId = normalizeString(r._id);
      if (parcelId === "") continue;
      const categoryId = parseCategoryId(r.categoryId);
      const rawName = normalizeString(r.categoryName);
      const fromCode = categoryId != null ? normalizeString(nomByCode.get(categoryId)) : "";
      const categoryName =
        fromCode !== ""
          ? fromCode
          : rawName !== ""
            ? rawName
            : categoryId != null
              ? "Code " + String(categoryId)
              : "";
      const vectors =
        typeof r.vectors === "number" && Number.isFinite(r.vectors) ? r.vectors : 0;
      byParcelId.set(parcelId, { categoryName, categoryId, vectors });
    }

    for (const f of geojson.features ?? []) {
      if (!f.properties) continue;
      const props = f.properties as Record<string, unknown>;
      const keyA = normalizeString(props.dag_feature_id);
      const keyB = normalizeString(props._id);
      const hit = byParcelId.get(keyA) ?? byParcelId.get(keyB);
      if (!hit || hit.categoryName === "") continue;

      // Champ Mongo prioritaire utilise par le filtre type de production.
      props.production_type_manual = hit.categoryName;
      props.manual_production_type = hit.categoryName;
      props.production_type_mongo_vectors = hit.vectors;
      if (hit.categoryId != null) {
        props.production_type_manual_code = hit.categoryId;
      }
    }

    return NextResponse.json({
      ok: true as const,
      source: "mongodb",
      data: geojson,
    });
  } catch {
    return NextResponse.json({
      ok: true as const,
      source: "fallback_static",
      warning: "fallback_static_data",
      data: geojson,
    });
  }
}
