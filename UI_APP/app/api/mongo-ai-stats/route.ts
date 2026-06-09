import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { getSharedMongoClient } from "@/lib/mongo-client-pool";
import { AI_MAILLE_SIDE_M } from "@/lib/cluster-types";
import { VECTOR_PATCH_PIXELS } from "@/lib/maille-gsd";
import { loadVegCatNomByCode } from "@/lib/parcel-csv-manual-veg-override";
import {
  mongoAiCollectionName,
  mongoDbName,
  mongoStacCollectionName,
  mongoUri,
} from "@/lib/runtime-env";
import { labelForSemesterKey } from "@/lib/semester-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Env: MONGO_URI, MONGO_DB, MONGO_AI_COLLECTION (AI), MONGO_STAC_COLLECTION (stac_items).
 * Surface par doc : (gsd * 64)^2 / 10000 ha avec properties.gsd en m/px ; sinon cote 42 m fallback.
 */
export async function GET() {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const uri = mongoUri();
  const dbName = mongoDbName();
  const collName = mongoAiCollectionName();
  const stacCollName = mongoStacCollectionName();

  try {
    const client = await getSharedMongoClient(uri);
    const coll = client.db(dbName).collection(collName);

    const analyzedDocuments = await coll.countDocuments({
      Agriculture: { $exists: true },
    });

    const facetAgg = await coll
      .aggregate<{
        byCat: Array<{
          _id: { category_id: unknown; category_name: unknown };
          cells: number;
          surfaceHa: number;
        }>;
        totals: Array<{ cells: number; surfaceHa: number }>;
      }>([
        {
          $addFields: {
            effCategoryId: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$Agriculture.Manual.is_set", true] },
                    { $eq: ["$Agriculture.Manual.check", true] },
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
                    { $eq: ["$Agriculture.Manual.check", true] },
                    { $ne: ["$Agriculture.Manual.category_id", null] },
                  ],
                },
                {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$Agriculture.Manual.category_name", null] },
                        { $ne: ["$Agriculture.Manual.category_name", ""] },
                      ],
                    },
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
          },
        },
        {
          $match: {
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
            gsd: "$stacDoc.properties.gsd",
          },
        },
        {
          $addFields: {
            sideM: {
              $cond: [
                {
                  $and: [{ $ne: ["$gsd", null] }, { $gt: ["$gsd", 0] }],
                },
                { $multiply: ["$gsd", VECTOR_PATCH_PIXELS] },
                AI_MAILLE_SIDE_M,
              ],
            },
          },
        },
        {
          $addFields: {
            areaM2: { $multiply: ["$sideM", "$sideM"] },
          },
        },
        {
          $addFields: {
            surfaceHa: { $divide: ["$areaM2", 10000] },
          },
        },
        {
          $facet: {
            byCat: [
              {
                $group: {
                  _id: {
                    category_id: "$effCategoryId",
                    category_name: "$effCategoryName",
                  },
                  cells: { $sum: 1 },
                  surfaceHa: { $sum: "$surfaceHa" },
                },
              },
              { $sort: { cells: -1 } },
            ],
            totals: [
              {
                $group: {
                  _id: null,
                  cells: { $sum: 1 },
                  surfaceHa: { $sum: "$surfaceHa" },
                },
              },
            ],
          },
        },
      ])
      .toArray();

    const facetRow = facetAgg[0];
    const rows = facetRow?.byCat ?? [];
    const tot = facetRow?.totals?.[0];
    const nomByCode = loadVegCatNomByCode();

    const byCategoryRaw = rows
      .map((a) => {
      const idRaw = a._id.category_id;
      const cid =
        typeof idRaw === "number"
          ? idRaw
          : Number.parseInt(String(idRaw ?? ""), 10);
      const cells = typeof a.cells === "number" ? a.cells : 0;
      const surfaceHa =
        typeof a.surfaceHa === "number" && Number.isFinite(a.surfaceHa)
          ? a.surfaceHa
          : 0;
      const nameRaw = String(a._id.category_name ?? "").trim();
      const fallback = Number.isFinite(cid) ? nomByCode.get(cid) ?? "" : "";
      return {
        category_id: Number.isFinite(cid) ? cid : NaN,
        category_name:
          fallback !== ""
            ? fallback
            : nameRaw !== ""
              ? nameRaw
              : "Code " + String(Number.isFinite(cid) ? cid : -1),
        cells,
        surfaceHa,
      };
      })
      .filter((r) => Number.isFinite(r.category_id));
    const byCategoryMap = new Map<
      number,
      { category_id: number; category_name: string; cells: number; surfaceHa: number }
    >();
    for (const row of byCategoryRaw) {
      const cur = byCategoryMap.get(row.category_id);
      if (!cur) {
        byCategoryMap.set(row.category_id, { ...row });
        continue;
      }
      cur.cells += row.cells;
      cur.surfaceHa += row.surfaceHa;
      // Keep first non-generic name if available.
      if (
        (cur.category_name.startsWith("Code ") || cur.category_name.trim() === "") &&
        row.category_name.trim() !== ""
      ) {
        cur.category_name = row.category_name;
      }
    }
    const byCategory = Array.from(byCategoryMap.values()).sort(
      (a, b) => b.surfaceHa - a.surfaceHa
    );

    const evolutionAgg = await coll
      .aggregate<{
        _id: { semesterKey: string; category_id: unknown; category_name: unknown };
        surfaceHa: number;
      }>([
        {
          $addFields: {
            effCategoryId: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$Agriculture.Manual.is_set", true] },
                    { $eq: ["$Agriculture.Manual.check", true] },
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
                    { $eq: ["$Agriculture.Manual.check", true] },
                    { $ne: ["$Agriculture.Manual.category_id", null] },
                  ],
                },
                {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$Agriculture.Manual.category_name", null] },
                        { $ne: ["$Agriculture.Manual.category_name", ""] },
                      ],
                    },
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
          },
        },
        {
          $match: {
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
            gsd: "$stacDoc.properties.gsd",
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
            sideM: {
              $cond: [
                {
                  $and: [{ $ne: ["$gsd", null] }, { $gt: ["$gsd", 0] }],
                },
                { $multiply: ["$gsd", VECTOR_PATCH_PIXELS] },
                AI_MAILLE_SIDE_M,
              ],
            },
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
          $addFields: {
            surfaceHa: {
              $divide: [{ $multiply: ["$sideM", "$sideM"] }, 10000],
            },
            semesterKey: {
              $cond: [
                { $ne: ["$effDateObj", null] },
                {
                  $concat: [
                    { $toString: { $year: "$effDateObj" } },
                    "-",
                    {
                      $cond: [{ $lte: [{ $month: "$effDateObj" }, 6] }, "S1", "S2"],
                    },
                  ],
                },
                null,
              ],
            },
          },
        },
        {
          $match: {
            semesterKey: { $ne: null },
          },
        },
        {
          $group: {
            _id: {
              semesterKey: "$semesterKey",
              category_id: "$effCategoryId",
              category_name: "$effCategoryName",
            },
            surfaceHa: { $sum: "$surfaceHa" },
          },
        },
      ])
      .toArray();

    const evolutionLineMap = new Map<number, string>();
    const evolutionBySemesterMap = new Map<string, Record<string, string | number>>();
    for (const row of evolutionAgg) {
      const key = String(row._id.semesterKey ?? "").trim();
      if (!key) continue;
      const idRaw = row._id.category_id;
      const cid =
        typeof idRaw === "number"
          ? idRaw
          : Number.parseInt(String(idRaw ?? ""), 10);
      if (!Number.isFinite(cid)) continue;
      const cnameRaw = String(row._id.category_name ?? "").trim();
      const cname = nomByCode.get(cid) || cnameRaw || "Code " + String(cid);
      if (!evolutionLineMap.has(cid)) evolutionLineMap.set(cid, cname);
      let slot = evolutionBySemesterMap.get(key);
      if (!slot) {
        slot = { semesterKey: key, semesterLabel: labelForSemesterKey(key), totalSurfaceHa: 0 };
        evolutionBySemesterMap.set(key, slot);
      }
      const ha = Number.isFinite(row.surfaceHa) ? row.surfaceHa : 0;
      slot[String(cid)] = (Number(slot[String(cid)] ?? 0) || 0) + ha;
      slot.totalSurfaceHa = (Number(slot.totalSurfaceHa ?? 0) || 0) + ha;
    }
    const evolutionLines = Array.from(evolutionLineMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([code, nom]) => ({ code, nom }));
    const evolutionBySemester = Array.from(evolutionBySemesterMap.values()).sort((a, b) =>
      String(a.semesterKey).localeCompare(String(b.semesterKey))
    );

    const totalCellsFromAgg =
      tot != null && typeof tot.cells === "number" ? tot.cells : 0;
    const totalSurfaceHaFromAgg =
      tot != null && typeof tot.surfaceHa === "number"
        ? tot.surfaceHa
        : 0;
    const cellSurfaceHaAvg =
      totalCellsFromAgg > 0
        ? totalSurfaceHaFromAgg / totalCellsFromAgg
        : 0;

    let totalDocuments = 0;
    try {
      totalDocuments = await coll.estimatedDocumentCount();
    } catch {
      totalDocuments = await coll.countDocuments({});
    }

    const avgAgg = await coll
      .aggregate<{ avgAcc: number | null }>([
        {
          $addFields: {
            effAccuracy: {
              $ifNull: [
                "$Agriculture.Model.accuracy",
                "$Agriculture.accuracy",
              ],
            },
          },
        },
        { $match: { effAccuracy: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgAcc: { $avg: "$effAccuracy" },
          },
        },
      ])
      .toArray();
    const firstAvg = avgAgg[0];
    const avgAccuracyPercent =
      firstAvg != null &&
      typeof firstAvg.avgAcc === "number" &&
      Number.isFinite(firstAvg.avgAcc)
        ? firstAvg.avgAcc
        : null;

    return NextResponse.json({
      ok: true as const,
      cellSurfaceHa: cellSurfaceHaAvg,
      totalDocuments,
      analyzedDocuments,
      avgAccuracyPercent,
      byCategory,
      evolutionLines,
      evolutionBySemester,
    });
  } catch (e) {
    return sanitizeErrorResponse("mongo-ai-stats.GET", e);
  }
}
