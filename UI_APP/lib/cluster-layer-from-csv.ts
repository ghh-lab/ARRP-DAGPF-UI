import fs from "fs";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { parse } from "csv-parse/sync";
import type { ClusterRankingEntry } from "@/lib/cluster-types";
import { rowManualVegLocked } from "@/lib/manual-veg-column";

const CELL_SIZE_M = 10;
const M_PER_DEG_LAT = 111320;

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ring[i][1];
    const yj = ring[j][1];
    const xi = ring[i][0];
    const xj = ring[j][0];
    const crosses = (yi > lat) !== (yj > lat);
    if (crosses) {
      const xinters = ((xj - xi) * (lat - yi)) / (yj - yi + 1e-30) + xi;
      if (lon < xinters) inside = !inside;
    }
  }
  return inside;
}

function pointInPolygonCoords(
  lon: number,
  lat: number,
  coords: unknown
): boolean {
  if (!coords || !Array.isArray(coords) || !Array.isArray((coords as unknown[])[0])) {
    return false;
  }
  const c = coords as number[][][];
  const outer = c[0];
  if (!pointInRing(lon, lat, outer)) return false;
  for (let h = 1; h < c.length; h++) {
    const hole = c[h];
    if (Array.isArray(hole) && pointInRing(lon, lat, hole as number[][])) {
      return false;
    }
  }
  return true;
}

export function pointInGeom(
  lon: number,
  lat: number,
  geom: { type: string; coordinates?: unknown }
): boolean {
  if (geom.type === "Polygon" && geom.coordinates) {
    return pointInPolygonCoords(lon, lat, geom.coordinates);
  }
  if (geom.type === "MultiPolygon" && geom.coordinates) {
    const polys = geom.coordinates as unknown[];
    for (const poly of polys) {
      if (Array.isArray(poly) && pointInPolygonCoords(lon, lat, poly)) {
        return true;
      }
    }
  }
  return false;
}

function loadDagParcelGeometries(
  dagPath: string
): Record<string, { type: string; coordinates?: unknown }> {
  if (!fs.existsSync(dagPath)) return {};
  const raw = fs.readFileSync(dagPath, "utf-8");
  const data = JSON.parse(raw) as unknown;
  const out: Record<string, { type: string; coordinates?: unknown }> = {};
  const iterable: unknown[] = Array.isArray(data)
    ? data
    : ((data as { features?: unknown[] }).features ?? []);
  for (const feat of iterable) {
    if (!feat || typeof feat !== "object") continue;
    const f = feat as { _id?: unknown; geometry?: { type?: string; coordinates?: unknown } };
    const fid = f._id;
    if (typeof fid !== "string" || !fid.trim()) continue;
    const geom = f.geometry;
    if (geom && geom.type && geom.coordinates) {
      out[fid.trim()] = { type: geom.type, coordinates: geom.coordinates };
    }
  }
  return out;
}

function centerInParcel(
  lon: number,
  lat: number,
  dagId: string,
  byId: Record<string, { type: string; coordinates?: unknown }>
): boolean {
  const geom = byId[dagId.trim()];
  if (!geom) return false;
  return pointInGeom(lon, lat, geom);
}

function squareAroundCenter(lon: number, lat: number, sizeM: number): Polygon {
  const half = 0.5 * sizeM;
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  const mPerDegLon = M_PER_DEG_LAT * Math.max(cosLat, 1e-8);
  const dlat = half / M_PER_DEG_LAT;
  const dlon = half / mPerDegLon;
  const ring: number[][] = [
    [lon - dlon, lat - dlat],
    [lon + dlon, lat - dlat],
    [lon + dlon, lat + dlat],
    [lon - dlon, lat + dlat],
    [lon - dlon, lat - dlat],
  ];
  return { type: "Polygon", coordinates: [ring] };
}

export type ClusterLayerPayload = {
  ranking: ClusterRankingEntry[];
  geojson: FeatureCollection;
  rowsUsed: number;
  rowsSkipped: number;
  csvPath: string;
  dagPath: string;
};

function countMapSortDesc(counts: Map<number, number>): ClusterRankingEntry[] {
  const arr = [...counts.entries()].map(([clusterId, count]) => ({
    clusterId,
    count,
  }));
  arr.sort((a, b) =>
    b.count !== a.count ? b.count - a.count : a.clusterId - b.clusterId
  );
  return arr;
}

/**
 * Build cluster ranking + vector squares GeoJSON from jungle pipeline CSV (same
 * logic as UI_APP/scripts/build_cluster_geojson.py).
 */
export function buildClusterLayerFromFiles(
  csvPath: string,
  dagPath: string
): ClusterLayerPayload {
  const csvRaw = fs.readFileSync(csvPath, "utf-8");
  const bom = csvRaw.charCodeAt(0) === 0xfeff;
  const text = bom ? csvRaw.slice(1) : csvRaw;
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];

  const parcelById = loadDagParcelGeometries(dagPath);
  const counts = new Map<number, number>();
  const features: Feature[] = [];
  let nSkip = 0;

  for (const row of rows) {
    if (rowManualVegLocked(row)) {
      nSkip += 1;
      continue;
    }
    const rawCid = (row.step2_cluster_id ?? "").trim();
    if (rawCid === "") {
      nSkip += 1;
      continue;
    }
    const cid = Number.parseFloat(rawCid);
    if (!Number.isFinite(cid)) {
      nSkip += 1;
      continue;
    }
    const clusterId = Math.trunc(cid);

    const rawLon = (row.step2_vector_lon ?? "").trim();
    const rawLat = (row.step2_vector_lat ?? "").trim();
    if (rawLon === "" || rawLat === "") {
      nSkip += 1;
      continue;
    }
    const lon = Number.parseFloat(rawLon);
    const lat = Number.parseFloat(rawLat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      nSkip += 1;
      continue;
    }

    const geom = squareAroundCenter(lon, lat, CELL_SIZE_M);
    counts.set(clusterId, (counts.get(clusterId) ?? 0) + 1);

    const vid = row.step2_vector_id ?? "";
    const dag = row.step2_dag_feature_id ?? "";
    const inParcel = centerInParcel(lon, lat, dag, parcelById) ? 1 : 0;

    const vlCx = row.vl_cell_center_x ?? "";
    const vlCy = row.vl_cell_center_y ?? "";
    const cogId = (row.step2_cog_id ?? "").trim();
    const acqDate = (row.acquisition_date ?? "").trim();

    features.push({
      type: "Feature",
      geometry: geom,
      properties: {
        cluster_id: clusterId,
        step2_vector_id: String(vid),
        step2_dag_feature_id: String(dag),
        step2_cog_id: cogId,
        acquisition_date: acqDate,
        vector_lon: lon,
        vector_lat: lat,
        mongo_vl_cell_center_x: vlCx,
        mongo_vl_cell_center_y: vlCy,
        cell_size_m: CELL_SIZE_M,
        center_in_parcel: inParcel,
      },
    });
  }

  const ranking = countMapSortDesc(counts);
  const geojson: FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  return {
    ranking,
    geojson,
    rowsUsed: features.length,
    rowsSkipped: nSkip,
    csvPath,
    dagPath,
  };
}
