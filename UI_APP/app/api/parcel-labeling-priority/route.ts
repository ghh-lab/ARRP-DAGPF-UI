import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { getSharedMongoClient } from "@/lib/mongo-client-pool";
import { mongoAiCollectionName, mongoDbName, mongoUri } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PriorityAggRow = {
  totalParcels?: Array<{ n?: number }>;
  top10?: Array<{ _id?: unknown; vectors?: number }>;
};

export async function GET() {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const uri = mongoUri();
  const dbName = mongoDbName();
  const collName = mongoAiCollectionName();

  try {
    const client = await getSharedMongoClient(uri);
    const coll = client.db(dbName).collection(collName);

    const agg = await coll
      .aggregate<PriorityAggRow>([
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
            $or: [
              { effCategoryId: 24 },
              {
                effCategoryName: {
                  $regex: "a\\s*labell?iser|a\\s*labeliser",
                  $options: "i",
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: "$effParcelIdStr",
            vectors: { $sum: 1 },
          },
        },
        { $sort: { vectors: -1, _id: 1 } },
        {
          $facet: {
            totalParcels: [{ $count: "n" }],
            top10: [{ $limit: 10 }],
          },
        },
      ])
      .toArray();

    const row = agg[0] ?? {};
    const totalParcels = row.totalParcels?.[0]?.n ?? 0;
    const top10 = (row.top10 ?? []).map((r) => ({
      dagFeatureId: String(r._id ?? ""),
      vectors:
        typeof r.vectors === "number" && Number.isFinite(r.vectors) ? r.vectors : 0,
    }));

    return NextResponse.json({
      ok: true as const,
      totalParcels,
      top10,
    });
  } catch (e) {
    return sanitizeErrorResponse("parcel-labeling-priority.GET", e);
  }
}
