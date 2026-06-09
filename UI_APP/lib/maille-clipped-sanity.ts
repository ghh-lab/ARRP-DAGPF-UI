import type { MultiPolygon, Polygon } from "geojson";

/**
 * Clip polygon-clipping peut renvoyer un MultiPolygon avec une partie parasite :
 * on eclate, on filtre chaque partie (axe, aire, centre dedans).
 */
const MAX_AXIS_FACTOR = 1.55;

const MAX_AREA_FACTOR = 1.22;

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

export function pointInPolygonLonLat(
  lon: number,
  lat: number,
  poly: Polygon
): boolean {
  const coords = poly.coordinates;
  const outer = coords[0];
  if (!outer || !pointInRing(lon, lat, outer)) return false;
  for (let h = 1; h < coords.length; h++) {
    const hole = coords[h];
    if (hole && pointInRing(lon, lat, hole)) return false;
  }
  return true;
}

export function explodeToPolygons(
  geom: Polygon | MultiPolygon
): Polygon[] {
  if (geom.type === "Polygon") return [geom];
  return geom.coordinates.map((rings) => ({
    type: "Polygon" as const,
    coordinates: rings,
  }));
}

/** Aire signee approx en m² (premier anneau), projection locale. */
function exteriorRingAreaM2(ring: number[][], refLat: number): number {
  if (!ring || ring.length < 3) return Infinity;
  const latRad = (refLat * Math.PI) / 180;
  const cosLat = Math.max(0.2, Math.cos(latRad));
  let sum = 0;
  const n = ring.length;
  const limit = ring[n - 1][0] === ring[0][0] && ring[n - 1][1] === ring[0][1]
    ? n - 1
    : n;
  for (let i = 0; i < limit; i++) {
    const j = (i + 1) % limit;
    const x1 = ring[i][0] * 111320 * cosLat;
    const y1 = ring[i][1] * 111320;
    const x2 = ring[j][0] * 111320 * cosLat;
    const y2 = ring[j][1] * 111320;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

export function polygonMaxAxisMeters(poly: Polygon, refLat: number): number {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const extendRing = (ring: number[][]) => {
    for (const pt of ring) {
      const lng = pt[0];
      const lat = pt[1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };

  for (const ring of poly.coordinates) extendRing(ring);

  if (
    minLng === Infinity ||
    minLat === Infinity ||
    maxLng === -Infinity ||
    maxLat === -Infinity
  ) {
    return Infinity;
  }

  const latRad = (refLat * Math.PI) / 180;
  const cosLat = Math.max(0.2, Math.cos(latRad));
  const wM = (maxLng - minLng) * 111320 * cosLat;
  const hM = (maxLat - minLat) * 111320;
  return Math.max(wM, hM);
}

export function approxPolygonAreaM2(poly: Polygon, refLat: number): number {
  return exteriorRingAreaM2(poly.coordinates[0] ?? [], refLat);
}

export function isSingleMaillePolygonPlausible(
  poly: Polygon,
  refLat: number,
  mailleSideM: number,
  mailleAreaM2: number
): boolean {
  const maxAxis = polygonMaxAxisMeters(poly, refLat);
  if (!Number.isFinite(maxAxis)) return false;
  if (!Number.isFinite(mailleSideM) || mailleSideM <= 0) return false;
  if (!Number.isFinite(mailleAreaM2) || mailleAreaM2 <= 0) return false;
  if (maxAxis > mailleSideM * MAX_AXIS_FACTOR) return false;
  const area = approxPolygonAreaM2(poly, refLat);
  if (!Number.isFinite(area)) return false;
  if (area > mailleAreaM2 * MAX_AREA_FACTOR) return false;
  return true;
}

/**
 * Parties du clip qui sont des mailles valides et contiennent le centre du point IA.
 */
export function filterClipToValidMaillePolygons(
  clipped: Polygon | MultiPolygon,
  centerLon: number,
  centerLat: number,
  refLat: number,
  mailleSideM: number,
  mailleAreaM2: number
): Polygon[] {
  const parts = explodeToPolygons(clipped);
  const out: Polygon[] = [];
  for (const poly of parts) {
    if (!isSingleMaillePolygonPlausible(poly, refLat, mailleSideM, mailleAreaM2))
      continue;
    if (!pointInPolygonLonLat(centerLon, centerLat, poly)) continue;
    out.push(poly);
  }
  return out;
}
