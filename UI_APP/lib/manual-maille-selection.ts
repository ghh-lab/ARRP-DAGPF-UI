import type { FeatureCollection } from "geojson";

export type ManualSelectedCellCenter = { lon: number; lat: number };

/** Cle stable pour une maille (point CSV / centre Mongo). */
export function mailleCenterKey(lon: number, lat: number): string {
  return lon.toFixed(7) + "," + lat.toFixed(7);
}

/** Micro-bbox autour du centre pour /api/parcel-manual-veg (pointInAnyBbox). */
export const MAILLE_CENTER_BBOX_EPS = 1e-7;

export function bboxAroundMailleCenter(
  lon: number,
  lat: number
): [number, number, number, number] {
  const e = MAILLE_CENTER_BBOX_EPS;
  return [lon - e, lat - e, lon + e, lat + e];
}

/**
 * Centres des mailles (overlay parcel-mongo) dont le centre tombe dans le rectangle lon/lat.
 */
export function mailleCentersInLngLatRectangle(
  overlay: FeatureCollection,
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): ManualSelectedCellCenter[] {
  const w = Math.min(lon1, lon2);
  const e = Math.max(lon1, lon2);
  const s = Math.min(lat1, lat2);
  const n = Math.max(lat1, lat2);
  const out: ManualSelectedCellCenter[] = [];
  for (const f of overlay.features) {
    const p = f.properties as Record<string, unknown> | undefined;
    if (!p) continue;
    const lon = Number(p.centerLon);
    const lat = Number(p.centerLat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon >= w && lon <= e && lat >= s && lat <= n) {
      out.push({ lon, lat });
    }
  }
  return out;
}
