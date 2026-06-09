import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import {
  ensureContentLengthWithin,
  requireAdminRoleStrict,
  requireClientRole,
  sanitizeErrorResponse,
} from "@/lib/api-security";
import { getSharedMongoClient } from "@/lib/mongo-client-pool";
import { mongoAiCollectionName, mongoDbName, mongoUri } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function dagFeatureIdMongoClause(
  dagFeatureId: string
): Record<string, unknown> | null {
  if (!dagFeatureId) return null;
  const parts: Record<string, unknown>[] = [
    { dag_feature_id: dagFeatureId },
    { "Agriculture.dag_feature_id": dagFeatureId },
  ];
  if (/^[a-fA-F0-9]{24}$/.test(dagFeatureId)) {
    try {
      parts.push({ dag_feature_id: new ObjectId(dagFeatureId) });
      parts.push({ "Agriculture.dag_feature_id": new ObjectId(dagFeatureId) });
    } catch {
      /* ignore */
    }
  }
  return parts.length === 1 ? parts[0]! : { $or: parts };
}

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
      .aggregate<{
        pendingSummary?: Array<{ n?: number }>;
        rows?: Array<{
          _id?: unknown;
          pendingCells?: number;
          checkedCells?: number;
          latestUpdateAt?: unknown;
        }>;
      }>([
        {
          $match: {
            "Agriculture.Manual.is_set": true,
          },
        },
        {
          $addFields: {
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
            manualChecked: { $eq: ["$Agriculture.Manual.check", true] },
          },
        },
        {
          $match: {
            effParcelIdStr: { $ne: "" },
          },
        },
        {
          $group: {
            _id: "$effParcelIdStr",
            pendingCells: {
              $sum: {
                $cond: [{ $eq: ["$manualChecked", true] }, 0, 1],
              },
            },
            checkedCells: {
              $sum: {
                $cond: [{ $eq: ["$manualChecked", true] }, 1, 0],
              },
            },
            latestUpdateAt: { $max: "$Agriculture.Manual.updated_at" },
          },
        },
        {
          $match: {
            pendingCells: { $gt: 0 },
          },
        },
        {
          $sort: { pendingCells: -1, _id: 1 },
        },
        {
          $facet: {
            pendingSummary: [{ $count: "n" }],
            rows: [{ $limit: 100 }],
          },
        },
      ])
      .toArray();

    const first = agg[0];
    const pendingParcels = first?.pendingSummary?.[0]?.n ?? 0;
    const rows = (first?.rows ?? []).map((r) => ({
      dagFeatureId: String(r._id ?? ""),
      pendingCells:
        typeof r.pendingCells === "number" && Number.isFinite(r.pendingCells)
          ? r.pendingCells
          : 0,
      checkedCells:
        typeof r.checkedCells === "number" && Number.isFinite(r.checkedCells)
          ? r.checkedCells
          : 0,
      latestUpdateAt:
        r.latestUpdateAt instanceof Date ? r.latestUpdateAt.toISOString() : null,
    }));

    return NextResponse.json({
      ok: true as const,
      pendingParcels,
      rows,
    });
  } catch (e) {
    return sanitizeErrorResponse("manual-label-review.GET", e);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminRoleStrict();
  if (!auth.ok) return auth.response;
  const oversized = ensureContentLengthWithin(request, 8 * 1024);
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
  const b = body as {
    dagFeatureId?: unknown;
    check?: unknown;
  };
  const dagFeatureId =
    typeof b.dagFeatureId === "string" ? b.dagFeatureId.trim() : "";
  if (!dagFeatureId || dagFeatureId.length > 128) {
    return NextResponse.json({ error: "dag_feature_id_required" }, { status: 400 });
  }
  if (typeof b.check !== "boolean") {
    return NextResponse.json({ error: "check_boolean_required" }, { status: 400 });
  }

  const uri = mongoUri();
  const dbName = mongoDbName();
  const collName = mongoAiCollectionName();
  try {
    const clause = dagFeatureIdMongoClause(dagFeatureId);
    if (!clause) {
      return NextResponse.json({ error: "dag_feature_id_required" }, { status: 400 });
    }
    const client = await getSharedMongoClient(uri);
    const coll = client.db(dbName).collection(collName);
    const now = new Date();
    const res = await coll.updateMany(
      {
        ...clause,
        "Agriculture.Manual.is_set": true,
      },
      {
        $set: {
          "Agriculture.Manual.check": b.check,
          "Agriculture.Manual.checked_at": now,
        },
      }
    );
    return NextResponse.json({
      ok: true as const,
      matched: res.matchedCount,
      modified: res.modifiedCount,
    });
  } catch (e) {
    return sanitizeErrorResponse("manual-label-review.POST", e);
  }
}
