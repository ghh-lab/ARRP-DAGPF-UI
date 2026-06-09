import type { MultiPolygon, Polygon } from "geojson";

function ringMeanLat(ring: number[][]): number {
  if (!ring.length) return 0;
  let s = 0;
  const n = ring.length;
  const limit = ring[n - 1][0] === ring[0][0] && ring[n - 1][1] === ring[0][1]
    ? n - 1
    : n;
  for (let i = 0; i < limit; i++) s += ring[i][1];
  return limit > 0 ? s / limit : 0;
}

/** Aire signee anneau en m² (projection locale autour de refLat). */
function ringAreaM2Signed(ring: number[][], refLat: number): number {
  if (!ring || ring.length < 3) return 0;
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
  return sum / 2;
}

function polygonRingsAreaM2(rings: number[][][]): number {
  if (!rings.length) return 0;
  const refLat = ringMeanLat(rings[0] ?? []);
  let a = ringAreaM2Signed(rings[0] ?? [], refLat);
  for (let i = 1; i < rings.length; i++) {
    a -= ringAreaM2Signed(rings[i] ?? [], refLat);
  }
  return Math.abs(a);
}

/**
 * Aire parcelle en m² (WGS84, approximation plane locale).
 */
export function parcelPolygonAreaM2(geom: Polygon | MultiPolygon): number {
  if (geom.type === "Polygon") {
    return polygonRingsAreaM2(geom.coordinates);
  }
  let sum = 0;
  for (const poly of geom.coordinates) {
    sum += polygonRingsAreaM2(poly);
  }
  return sum;
}
