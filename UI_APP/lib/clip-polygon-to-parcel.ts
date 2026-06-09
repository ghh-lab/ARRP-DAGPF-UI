/**
 * Intersection GeoJSON avec polygon-clipping (pas Turf / RBush).
 */
import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "geojson";
import type {
  MultiPolygon as PCMulti,
  Polygon as PCPoly,
} from "polygon-clipping";

const COORD_PRECISION = 12;
type XY = [number, number];

function samePoint(
  a: XY | undefined,
  b: XY | undefined,
  eps = 1e-12
): boolean {
  if (!a || !b || a.length < 2 || b.length < 2) return false;
  return Math.abs(a[0]! - b[0]!) <= eps && Math.abs(a[1]! - b[1]!) <= eps;
}

function ringAreaAbs(ring: XY[]): number {
  if (ring.length < 4) return 0;
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i]!;
    const p2 = ring[i + 1]!;
    s += p1[0]! * p2[1]! - p2[0]! * p1[1]!;
  }
  return Math.abs(s) / 2;
}

function sanitizeRing(ring: number[][]): XY[] | null {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const core: XY[] = [];
  for (const pt of ring) {
    if (!pt || pt.length < 2) continue;
    const x = Number(pt[0]);
    const y = Number(pt[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    core.push([x, y]);
  }
  if (core.length < 4) return null;
  if (samePoint(core[0], core[core.length - 1])) core.pop();

  const uniq: XY[] = [];
  const seen = new Set<string>();

  for (const xy of core) {
    const x = xy[0];
    const y = xy[1];
    if (uniq.length > 0 && samePoint(uniq[uniq.length - 1], xy)) {
      continue;
    }

    const key = x.toFixed(COORD_PRECISION) + "," + y.toFixed(COORD_PRECISION);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(xy);
  }

  if (uniq.length < 3) return null;
  const closed: XY[] = [...uniq, [uniq[0]![0]!, uniq[0]![1]!]];
  if (ringAreaAbs(closed) <= 0) return null;
  return closed;
}

function sanitizePoly(poly: PCPoly): PCPoly | null {
  if (!Array.isArray(poly) || poly.length === 0) return null;
  const outer = sanitizeRing(poly[0] as number[][]);
  if (!outer) return null;
  const holes: XY[][] = [];
  for (let i = 1; i < poly.length; i++) {
    const h = sanitizeRing(poly[i] as number[][]);
    if (h) holes.push(h);
  }
  return [outer, ...holes];
}

function sanitizeGeom(geom: PCPoly | PCMulti): PCPoly | PCMulti | null {
  if (!Array.isArray(geom) || geom.length === 0) return null;
  // Distinguish Polygon ([[[x,y],...], ...]) vs MultiPolygon ([poly, poly,...])
  const first = geom[0] as unknown;
  const isPolygon =
    Array.isArray(first) &&
    Array.isArray((first as unknown[])[0]) &&
    typeof (((first as unknown[])[0] as unknown[])[0] as unknown) === "number";
  if (isPolygon) {
    return sanitizePoly(geom as PCPoly);
  }
  const mp = geom as PCMulti;
  const polys: PCPoly[] = [];
  for (const p of mp) {
    const sp = sanitizePoly(p);
    if (sp) polys.push(sp);
  }
  if (polys.length === 0) return null;
  return polys;
}

/**
 * Coupe un polygone (maille carree) par la parcelle. Vide si hors parcelle.
 */
export function clipPolygonToParcelPolygon(
  subject: Polygon,
  parcel: Polygon | MultiPolygon
): Polygon | MultiPolygon | null {
  const subjRaw = subject.coordinates as PCPoly;
  const clipRaw: PCPoly | PCMulti =
    parcel.type === "Polygon"
      ? (parcel.coordinates as PCPoly)
      : (parcel.coordinates as PCMulti);
  const subj = sanitizeGeom(subjRaw);
  const clipGeom = sanitizeGeom(clipRaw);
  if (!subj || !clipGeom) return null;

  let result: number[][][][] | null = null;
  try {
    result = polygonClipping.intersection(subj as PCPoly, clipGeom as PCPoly);
  } catch {
    return null;
  }
  if (!result || result.length === 0) return null;

  if (result.length === 1) {
    return { type: "Polygon", coordinates: result[0]! };
  }
  return { type: "MultiPolygon", coordinates: result };
}
