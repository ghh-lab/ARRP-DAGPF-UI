import type { Feature } from "geojson";

/** Cle stable pour une parcelle selectionnee (anti course async Mongo). */
export function parcelStableSelectionKey(f: Feature | null): string {
  if (!f) return "";
  if (f.id !== undefined && f.id !== null) {
    return "id:" + String(f.id);
  }
  const p = f.properties as Record<string, unknown> | null | undefined;
  if (p) {
    const x = p._id ?? p.parcel_id ?? p.dag_feature_id ?? p.num_lot;
    if (x !== undefined && x !== null && String(x).length > 0) {
      return "prop:" + String(x);
    }
  }
  return "geom:" + JSON.stringify(f.geometry);
}
