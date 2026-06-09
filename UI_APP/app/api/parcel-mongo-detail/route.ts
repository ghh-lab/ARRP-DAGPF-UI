import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Collection, Document } from "mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import {
  ensureContentLengthWithin,
  requireClientRole,
  sanitizeErrorResponse,
} from "@/lib/api-security";
import { getSharedMongoClient } from "@/lib/mongo-client-pool";
import { approxPolygonAreaM2 } from "@/lib/maille-clipped-sanity";
import type { LonLat } from "@/lib/geo-parcel-overlay";
import { parcelPolygonAreaM2 } from "@/lib/parcel-polygon-area";
import { unifyParcelCategory } from "@/lib/parcel-category-unify";
import { loadVegCatNomByCode } from "@/lib/parcel-csv-manual-veg-override";
import { voronoiMaillesClippedToParcel } from "@/lib/parcel-voronoi-mailles";
import { fillForVegCatCode } from "@/lib/veg-chart-colors";
import type {
  ParcelMongoCategoryEntry,
  ParcelMongoDetailOk,
} from "@/lib/parcel-mongo-detail-types";
import { mongoAiCollectionName, mongoDbName, mongoUri } from "@/lib/runtime-env";
import { semesterKeyFromIsoDatetime } from "@/lib/semester-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Mailles : diagramme de Voronoi sur les centres IA, coupe par la parcelle
 * (pas de chevauchement). Surfaces ha par cellule = aire geometrique clippee.
 * Couleurs et libelles unifies via classes JSON.
 *
 * Env: MONGO_URI, MONGO_DB, MONGO_AI_COLLECTION.
 */

function isAreaGeometry(g: unknown): g is Polygon | MultiPolygon {
  if (!g || typeof g !== "object") return false;
  const t = (g as { type?: unknown }).type;
  return t === "Polygon" || t === "MultiPolygon";
}

function isGeomDoc(g: unknown): g is { type: string; coordinates?: unknown } {
  return (
    typeof g === "object" &&
    g !== null &&
    "type" in g &&
    typeof (g as { type: unknown }).type === "string"
  );
}

/** Parcelles geojson : _id string ; Mongo peut stocker dag_feature_id en string ou ObjectId. */
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

function aiDocDedupeKey(doc: Document): string {
  if (doc._id != null) return String(doc._id);
  const cellId = doc.cell_id;
  if (cellId != null && String(cellId).length > 0) {
    return "cell_id:" + String(cellId);
  }
  const g = doc.geometry as { type?: unknown; coordinates?: unknown } | undefined;
  if (g?.coordinates !== undefined) {
    return "geom:" + JSON.stringify(g.coordinates);
  }
  return "empty";
}

/**
 * Jointure dag_feature_id (string ou ObjectId) + points dans le polygone parcelle,
 * sans exiger Agriculture.category_id (rempli en fallback plus bas).
 */
async function loadAiDocumentsForParcel(
  coll: Collection<Document>,
  geom: Polygon | MultiPolygon,
  dagFeatureId: string
): Promise<Document[]> {
  const projection = {
    geometry: 1,
    Agriculture: 1,
    dag_feature_id: 1,
    cell_id: 1,
    stac_id: 1,
    acquisition_date: 1,
    datetime: 1,
    stac_datetime: 1,
    vl_acquisition_timestamp: 1,
    acquisition_timestamp: 1,
  };

  const merged = new Map<string, Document>();

  if (dagFeatureId) {
    const idClause = dagFeatureIdMongoClause(dagFeatureId);
    if (idClause) {
      const cur = coll.find(idClause, { projection });
      for await (const doc of cur) {
        const k = aiDocDedupeKey(doc);
        if (!merged.has(k)) merged.set(k, doc);
      }
    }
  }

  const geoCur = coll.find(
    {
      geometry: {
        $geoWithin: {
          $geometry: geom,
        },
      },
    },
    { projection }
  );
  for await (const doc of geoCur) {
    const k = aiDocDedupeKey(doc);
    if (!merged.has(k)) merged.set(k, doc);
  }

  return [...merged.values()];
}

function parseAccuracyPercent(ag: unknown): number | null {
  if (!ag || typeof ag !== "object") return null;
  const raw = (ag as { accuracy?: unknown }).accuracy;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function docStringField(doc: Document, key: string): string {
  const v = doc[key];
  return typeof v === "string" ? v.trim() : "";
}

function docSemesterKey(doc: Document): string | null {
  const dateCandidates = [
    docStringField(doc, "acquisition_date"),
    docStringField(doc, "datetime"),
    docStringField(doc, "stac_datetime"),
    docStringField(doc, "vl_acquisition_timestamp"),
    docStringField(doc, "acquisition_timestamp"),
  ];
  for (const ds of dateCandidates) {
    const sk = semesterKeyFromIsoDatetime(ds);
    if (sk) return sk;
  }
  return null;
}

function docMatchesStacSelection(
  doc: Document,
  stacItemId: string | null,
  datetime: string | null
): boolean {
  if (stacItemId) {
    const sid = docStringField(doc, "stac_id");
    return sid !== "" && sid === stacItemId;
  }
  if (datetime) {
    const wanted = semesterKeyFromIsoDatetime(datetime);
    if (!wanted) return false;
    const got = docSemesterKey(doc);
    return got != null && got === wanted;
  }
  return true;
}

function parseCategoryId(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

function overlayLabelForCategory(name: string): string {
  const n = name.trim();
  if (!n) return "";
  if (n.length <= 14) return n;
  return n.slice(0, 13) + "…";
}

function resolveCategorySource(ag: {
  Model?: { category_id?: unknown; category_name?: unknown; accuracy?: unknown };
  Manual?: {
    is_set?: unknown;
    check?: unknown;
    category_id?: unknown;
    category_name?: unknown;
  };
  category_id?: unknown;
  category_name?: unknown;
  accuracy?: unknown;
}): {
  categoryId: number | null;
  categoryName: string;
  manual: boolean;
  modelOrLegacyForAccuracy: unknown;
} {
  const manualEnabled = ag.Manual?.is_set === true;
  const manualId = parseCategoryId(ag.Manual?.category_id);
  // Pour l affichage parcelle (carte + fiche), on montre toujours la classe
  // manuelle annotee si elle existe, meme non validee.
  if (manualEnabled && manualId != null) {
    return {
      categoryId: manualId,
      categoryName: String(ag.Manual?.category_name ?? ""),
      manual: true,
      modelOrLegacyForAccuracy: ag.Model ?? ag,
    };
  }
  const modelId = parseCategoryId(ag.Model?.category_id);
  if (modelId != null) {
    return {
      categoryId: modelId,
      categoryName: String(ag.Model?.category_name ?? ""),
      manual: false,
      modelOrLegacyForAccuracy: ag.Model ?? ag,
    };
  }
  const legacyId = parseCategoryId(ag.category_id);
  return {
    categoryId: legacyId,
    categoryName: String(ag.category_name ?? ""),
    manual: false,
    modelOrLegacyForAccuracy: ag,
  };
}

export async function POST(request: Request) {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const oversized = ensureContentLengthWithin(request, 512 * 1024);
  if (oversized) return oversized;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "body_required" }, { status: 400 });
  }

  const b = body as {
    geometry?: unknown;
    dagFeatureId?: unknown;
    parcelSurfaceKm2?: unknown;
    parcelSurfaceHa?: unknown;
    datetime?: unknown;
    stacItemId?: unknown;
  };
  const geom = b.geometry;
  if (!isAreaGeometry(geom)) {
    return NextResponse.json(
      { ok: false, error: "geometry_polygon_required" },
      { status: 400 }
    );
  }
  const geometrySize = JSON.stringify(geom).length;
  if (geometrySize > 400_000) {
    return NextResponse.json({ ok: false, error: "geometry_too_large" }, { status: 400 });
  }

  const dagFeatureIdRaw = b.dagFeatureId;
  const dagFeatureId =
    typeof dagFeatureIdRaw === "string" ? dagFeatureIdRaw.trim() : "";
  if (dagFeatureId.length > 128) {
    return NextResponse.json({ ok: false, error: "dag_feature_id_invalid" }, { status: 400 });
  }
  const stacItemId =
    typeof b.stacItemId === "string" && b.stacItemId.trim() !== ""
      ? b.stacItemId.trim()
      : null;
  const datetime =
    typeof b.datetime === "string" && b.datetime.trim() !== ""
      ? b.datetime.trim()
      : null;

  const uri = mongoUri();
  const dbName = mongoDbName();
  const collName = mongoAiCollectionName();

  try {
    const nomByCode = loadVegCatNomByCode();

    const client = await getSharedMongoClient(uri);
    const coll = client.db(dbName).collection(collName);

    const docsRaw = await loadAiDocumentsForParcel(coll, geom, dagFeatureId);
    const docs = docsRaw.filter((d) => docMatchesStacSelection(d, stacItemId, datetime));

    type PendingRaw = {
      coord: LonLat;
      accuracyPercent: number | null;
      category_id: number;
      category_name: string;
      categoryFillKind: "mongo";
      manualIsSet: boolean;
      manualChecked: boolean;
    };

    type Pending = {
      coord: LonLat;
      accuracyPercent: number | null;
      chartCode: number;
      displayName: string;
      manualIsSet: boolean;
      manualChecked: boolean;
    };

    const pendingRaw: PendingRaw[] = [];

    for (const doc of docs) {
      const g = doc.geometry;
      if (!isGeomDoc(g) || g.type !== "Point" || !Array.isArray(g.coordinates))
        continue;
      const c = g.coordinates as number[];
      if (c.length < 2) continue;
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const ag = (doc.Agriculture ?? {}) as {
        Model?: {
          category_id?: unknown;
          category_name?: unknown;
          accuracy?: unknown;
        };
        Manual?: {
          is_set?: unknown;
          check?: unknown;
          category_id?: unknown;
          category_name?: unknown;
        };
        category_id?: unknown;
        category_name?: unknown;
        accuracy?: unknown;
      };
      const picked = resolveCategorySource(ag);
      const manualIsSet = ag.Manual?.is_set === true;
      const manualChecked = ag.Manual?.check === true;
      let cid = picked.categoryId;
      let cname = picked.categoryName;
      if (Number.isFinite(cid) && !cname.trim()) {
        const mapped = nomByCode.get(Number(cid));
        if (mapped) cname = mapped;
      }
      if (cid == null) {
        cid = 24;
        if (!cname.trim()) cname = "A labelliser";
      }
      const accuracyPercent = parseAccuracyPercent(picked.modelOrLegacyForAccuracy);
      if (!manualIsSet && accuracyPercent != null && accuracyPercent < 50) {
        cid = 24;
        cname = "A labelliser";
      }

      pendingRaw.push({
        coord: [lon, lat],
        accuracyPercent,
        category_id: cid,
        category_name: cname,
        categoryFillKind: "mongo",
        manualIsSet,
        manualChecked,
      });
    }

    const pending: Pending[] = pendingRaw.map((pr) => {
      const u = unifyParcelCategory(
        nomByCode,
        pr.category_name,
        pr.category_id,
        pr.categoryFillKind
      );
      return {
        coord: pr.coord,
        accuracyPercent: pr.accuracyPercent,
        chartCode: u.chartCode,
        displayName: u.displayName,
        manualIsSet: pr.manualIsSet,
        manualChecked: pr.manualChecked,
      };
    });

    const n = pending.length;

    let parcelKm2: number | null = null;
    if (
      typeof b.parcelSurfaceKm2 === "number" &&
      Number.isFinite(b.parcelSurfaceKm2) &&
      b.parcelSurfaceKm2 > 0
    ) {
      parcelKm2 = b.parcelSurfaceKm2;
    } else if (
      typeof b.parcelSurfaceHa === "number" &&
      Number.isFinite(b.parcelSurfaceHa) &&
      b.parcelSurfaceHa > 0
    ) {
      parcelKm2 = b.parcelSurfaceHa / 100;
    }

    let parcelM2: number;
    if (parcelKm2 != null && parcelKm2 > 0) {
      parcelM2 = parcelKm2 * 1_000_000;
    } else {
      parcelM2 = parcelPolygonAreaM2(geom);
    }

    if (!Number.isFinite(parcelM2) || parcelM2 <= 0) {
      return NextResponse.json(
        { ok: false, error: "parcel_surface_invalid" },
        { status: 200 }
      );
    }

    const voronoiCells =
      n > 0 ? voronoiMaillesClippedToParcel(pending.map((p) => p.coord), geom) : [];

    const groups = new Map<
      string,
      {
        chartCode: number;
        displayName: string;
        points: {
          coord: LonLat;
          accuracyPercent: number | null;
          surfaceHa: number;
        }[];
      }
    >();

    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]!;
      const surfaceHa = voronoiCells[i]?.surfaceHa ?? 0;
      const key = String(p.chartCode);
      let slot = groups.get(key);
      if (!slot) {
        slot = {
          chartCode: p.chartCode,
          displayName: p.displayName,
          points: [],
        };
        groups.set(key, slot);
      }
      slot.points.push({
        coord: p.coord,
        accuracyPercent: p.accuracyPercent,
        surfaceHa,
      });
    }

    const entries: ParcelMongoCategoryEntry[] = [];
    const overlayFeatures: Feature<Polygon>[] = [];

    for (const g of groups.values()) {
      const cells = g.points.length;
      const surfaceHa = g.points.reduce((s, pt) => s + pt.surfaceHa, 0);
      entries.push({
        category_id: g.chartCode,
        category_name: g.displayName,
        cells,
        surfaceHa,
      });
    }

    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]!;
      const vc = voronoiCells[i];
      if (!vc || vc.polygons.length === 0) continue;
      const lon0 = p.coord[0];
      const lat0 = p.coord[1];
      for (const clippedGeom of vc.polygons) {
        overlayFeatures.push({
          type: "Feature",
          properties: {
            category_id: p.chartCode,
            category_name: p.displayName,
            category_label: overlayLabelForCategory(p.displayName),
            fillColor: fillForVegCatCode(p.chartCode),
            cells: 1,
            accuracyPercent: p.accuracyPercent,
            manualIsSet: p.manualIsSet,
            manualChecked: p.manualChecked,
            centerLon: lon0,
            centerLat: lat0,
          },
          geometry: clippedGeom,
        });
      }
    }

    overlayFeatures.sort((a, b) => {
      const la = Number(
        (a.properties as { centerLat?: unknown }).centerLat
      );
      const lb = Number(
        (b.properties as { centerLat?: unknown }).centerLat
      );
      const aa = approxPolygonAreaM2(a.geometry, la);
      const ab = approxPolygonAreaM2(b.geometry, lb);
      return ab - aa;
    });

    entries.sort((a, b) => b.surfaceHa - a.surfaceHa);

    const totalCells = entries.reduce((s, e) => s + e.cells, 0);
    const totalSurfaceHa = entries.reduce((s, e) => s + e.surfaceHa, 0);
    const averageCellSurfaceHa =
      totalCells > 0 ? totalSurfaceHa / totalCells : 0;

    const overlay: FeatureCollection = {
      type: "FeatureCollection",
      features: overlayFeatures,
    };

    const payload: ParcelMongoDetailOk = {
      ok: true,
      cellSurfaceHa: averageCellSurfaceHa,
      totalCells,
      entries,
      overlay,
    };

    return NextResponse.json(payload);
  } catch (e) {
    return sanitizeErrorResponse("parcel-mongo-detail.POST", e);
  }
}
