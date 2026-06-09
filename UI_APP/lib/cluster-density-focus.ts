import type { Feature } from "geojson";
import { bboxFromFeature } from "@/lib/bbox";

/** Coarse grid over cluster extent. */
const LEVEL1_BINS = 44;
/** Finer grid inside the densest level-1 cell (hotspot). */
const LEVEL2_BINS = 40;

/** Relative margin around the winning dense patch (tight fit). */
const PAD_FRAC_OF_SPAN = 0.06;
/** Minimum pad vs whole-cluster span so the box is never degenerate. */
const PAD_MIN_FRAC_OF_CLUSTER = 0.004;

function centroidLonLat(f: Feature): [number, number] | null {
  const p = f.properties as Record<string, unknown> | null;
  if (p) {
    const lon = p.vector_lon;
    const lat = p.vector_lat;
    if (typeof lon === "number" && typeof lat === "number") {
      return [lon, lat];
    }
  }
  const bb = bboxFromFeature(f);
  if (!bb) return null;
  return [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
}

function extentOfPts(pts: [number, number][]) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lo, la] of pts) {
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
  }
  return { minLon, minLat, maxLon, maxLat };
}

/**
 * Points whose (lon,lat) falls in the count-maximal grid cell.
 */
function densestGridSubset(
  pts: [number, number][],
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
  bins: number
): [number, number][] {
  const lonSpan = Math.max(maxLon - minLon, 1e-12);
  const latSpan = Math.max(maxLat - minLat, 1e-12);

  const binKey = (lo: number, la: number): string => {
    const ix = Math.min(
      bins - 1,
      Math.max(0, Math.floor(((lo - minLon) / lonSpan) * bins))
    );
    const iy = Math.min(
      bins - 1,
      Math.max(0, Math.floor(((la - minLat) / latSpan) * bins))
    );
    return ix + "," + iy;
  };

  const counts = new Map<string, number>();
  for (const [lo, la] of pts) {
    const k = binKey(lo, la);
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  let bestKey = "";
  let bestCount = -1;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      bestKey = k;
    }
  }

  return pts.filter(([lo, la]) => binKey(lo, la) === bestKey);
}

/**
 * Bounding box [[west,south],[east,north]] around the densest fine-scale
 * hotspot (two-level grid), then tight padding.
 */
export function boundsDensestClusterCells(
  features: Feature[]
): [[number, number], [number, number]] | null {
  const pts: [number, number][] = [];
  for (const f of features) {
    const c = centroidLonLat(f);
    if (c) pts.push(c);
  }
  const n = pts.length;
  if (n === 0) return null;
  if (n === 1) {
    const [lo, la] = pts[0];
    const pad = 0.00018;
    return [
      [lo - pad, la - pad],
      [lo + pad, la + pad],
    ];
  }

  const cluster = extentOfPts(pts);
  const clusterLonSpan = Math.max(
    cluster.maxLon - cluster.minLon,
    1e-12
  );
  const clusterLatSpan = Math.max(
    cluster.maxLat - cluster.minLat,
    1e-12
  );

  const d1 = densestGridSubset(
    pts,
    cluster.minLon,
    cluster.maxLon,
    cluster.minLat,
    cluster.maxLat,
    LEVEL1_BINS
  );
  if (d1.length === 0) return null;

  let focus = d1;
  if (d1.length >= 2) {
    const e1 = extentOfPts(d1);
    const d2 = densestGridSubset(
      d1,
      e1.minLon,
      e1.maxLon,
      e1.minLat,
      e1.maxLat,
      LEVEL2_BINS
    );
    if (d2.length > 0) focus = d2;
  }

  const dl = extentOfPts(focus);
  const dlMinLon = dl.minLon;
  const dlMinLat = dl.minLat;
  const dlMaxLon = dl.maxLon;
  const dlMaxLat = dl.maxLat;

  const spanLon = Math.max(dlMaxLon - dlMinLon, 1e-12);
  const spanLat = Math.max(dlMaxLat - dlMinLat, 1e-12);

  const padLon = Math.max(
    spanLon * PAD_FRAC_OF_SPAN,
    clusterLonSpan * PAD_MIN_FRAC_OF_CLUSTER,
    1e-7
  );
  const padLat = Math.max(
    spanLat * PAD_FRAC_OF_SPAN,
    clusterLatSpan * PAD_MIN_FRAC_OF_CLUSTER,
    1e-7
  );

  return [
    [dlMinLon - padLon, dlMinLat - padLat],
    [dlMaxLon + padLon, dlMaxLat + padLat],
  ];
}
