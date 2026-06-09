import type { Document } from "mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import {
  ensureContentLengthWithin,
  requireClientRole,
  sanitizeErrorResponse,
} from "@/lib/api-security";
import { getSharedMongoClient } from "@/lib/mongo-client-pool";
import { loadVegCatNomByCode } from "@/lib/parcel-csv-manual-veg-override";
import { pointInAnyBbox } from "@/lib/point-in-bbox";
import { mongoAiCollectionName, mongoDbName, mongoUri } from "@/lib/runtime-env";
import { semesterKeyFromIsoDatetime } from "@/lib/semester-key";

export const dynamic = "force-dynamic";

function isGeom(o: unknown): o is { type: string; coordinates?: unknown } {
  return (
    typeof o === "object" &&
    o !== null &&
    "type" in o &&
    typeof (o as { type: unknown }).type === "string"
  );
}

function isBbox(
  o: unknown
): o is [number, number, number, number] {
  if (!Array.isArray(o) || o.length !== 4) return false;
  for (const x of o) {
    if (typeof x !== "number" || !Number.isFinite(x)) return false;
  }
  return true;
}

function isBboxesArray(
  o: unknown
): o is [number, number, number, number][] {
  if (!Array.isArray(o) || o.length === 0) return false;
  for (const x of o) {
    if (!isBbox(x)) return false;
  }
  return true;
}

function pointFromDocGeometry(doc: Document): { lon: number; lat: number } | null {
  const g = doc.geometry as { type?: unknown; coordinates?: unknown } | undefined;
  if (!g || g.type !== "Point" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
    return null;
  }
  const lon = Number(g.coordinates[0]);
  const lat = Number(g.coordinates[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

function stringField(doc: Document, key: string): string {
  const v = doc[key];
  return typeof v === "string" ? v.trim() : "";
}

function docSemesterKey(doc: Document): string | null {
  const candidates = [
    stringField(doc, "acquisition_date"),
    stringField(doc, "stac_datetime"),
    stringField(doc, "datetime"),
    stringField(doc, "vl_acquisition_timestamp"),
    stringField(doc, "acquisition_timestamp"),
  ];
  for (const ds of candidates) {
    const k = semesterKeyFromIsoDatetime(ds);
    if (k) return k;
  }
  return null;
}

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

  const b = body as {
    geometry?: unknown;
    datetime?: unknown;
    bbox?: unknown;
    bboxes?: unknown;
    vegCat?: unknown;
    stacItemId?: unknown;
    dagFeatureId?: unknown;
  };

  if (!isGeom(b.geometry)) {
    return NextResponse.json({ error: "geometry_required" }, { status: 400 });
  }
  const geometryStringSize = JSON.stringify(b.geometry).length;
  if (geometryStringSize > 200_000) {
    return NextResponse.json({ error: "geometry_too_large" }, { status: 400 });
  }
  const datetime =
    typeof b.datetime === "string" ? b.datetime.trim() : null;
  if (!datetime) {
    return NextResponse.json({ error: "datetime_required" }, { status: 400 });
  }
  let boxes: [number, number, number, number][];
  if (isBboxesArray(b.bboxes)) {
    boxes = b.bboxes;
  } else if (isBbox(b.bbox)) {
    boxes = [b.bbox];
  } else {
    return NextResponse.json(
      { error: "bbox_or_bboxes_required" },
      { status: 400 }
    );
  }
  if (boxes.length > 256) {
    return NextResponse.json({ error: "too_many_bboxes" }, { status: 400 });
  }
  const vegCat = Number(b.vegCat);
  if (!Number.isFinite(vegCat) || !Number.isInteger(vegCat)) {
    return NextResponse.json({ error: "veg_cat_required" }, { status: 400 });
  }
  const stacItemId =
    typeof b.stacItemId === "string" && b.stacItemId.trim() !== ""
      ? b.stacItemId.trim()
      : null;
  const dagFeatureId =
    typeof b.dagFeatureId === "string" && b.dagFeatureId.trim() !== ""
      ? b.dagFeatureId.trim()
      : "";
  if (dagFeatureId.length > 128) {
    return NextResponse.json({ error: "dag_feature_id_invalid" }, { status: 400 });
  }

  const periodKey = semesterKeyFromIsoDatetime(datetime);
  if (!periodKey) {
    return NextResponse.json(
      { error: "datetime_unparsed" },
      { status: 400 }
    );
  }

  const geometry = b.geometry;
  const uri = mongoUri();
  const dbName = mongoDbName();
  const collName = mongoAiCollectionName();
  let updated = 0;
  try {
    const nomByCode = loadVegCatNomByCode();
    const client = await getSharedMongoClient(uri);
    const coll = client.db(dbName).collection(collName);
    const dagClause = dagFeatureIdMongoClause(dagFeatureId);
    const matchFilter =
      dagClause != null
        ? {
            $or: [
              {
                geometry: {
                  $geoWithin: {
                    $geometry: geometry,
                  },
                },
              },
              dagClause,
            ],
          }
        : {
            geometry: {
              $geoWithin: {
                $geometry: geometry,
              },
            },
          };

    const cur = coll.find(
      matchFilter,
      {
        projection: {
          _id: 1,
          geometry: 1,
          stac_id: 1,
          acquisition_date: 1,
          stac_datetime: 1,
          datetime: 1,
          vl_acquisition_timestamp: 1,
          acquisition_timestamp: 1,
          Agriculture: 1,
        },
      }
    );
    const now = new Date();
    for await (const doc of cur) {
      const pt = pointFromDocGeometry(doc);
      if (!pt) continue;
      if (!pointInAnyBbox(pt.lon, pt.lat, boxes)) continue;

      const docStacId = stringField(doc, "stac_id");
      if (stacItemId) {
        if (docStacId !== "" && docStacId !== stacItemId) continue;
      }
      const dk = docSemesterKey(doc);
      if (dk && dk !== periodKey) continue;
      if (!dk && !stacItemId) continue;

      const ag = (doc.Agriculture ?? {}) as {
        Manual?: { created_at?: unknown };
      };
      const setObj: Record<string, unknown> = {
        "Agriculture.Manual.is_set": true,
        "Agriculture.Manual.category_id": vegCat,
        "Agriculture.Manual.category_name":
          nomByCode.get(vegCat) ?? ("Code " + String(vegCat)),
        "Agriculture.Manual.source": "ui_manual",
        "Agriculture.Manual.check": false,
        "Agriculture.Manual.checked_at": null,
        "Agriculture.Manual.updated_at": now,
      };
      if (ag.Manual?.created_at == null) {
        setObj["Agriculture.Manual.created_at"] = now;
      }
      const res = await coll.updateOne(
        { _id: doc._id },
        {
          $set: setObj,
        }
      );
      if (res.modifiedCount > 0) updated += 1;
    }
  } catch (e) {
    return sanitizeErrorResponse("parcel-manual-veg.POST", e);
  }

  return NextResponse.json({
    ok: true,
    updated,
    semesterKey: periodKey,
  });
}
