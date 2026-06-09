import { Delaunay } from "d3-delaunay";
import type { MultiPolygon, Polygon } from "geojson";
import { clipPolygonToParcelPolygon } from "@/lib/clip-polygon-to-parcel";
import type { LonLat } from "@/lib/geo-parcel-overlay";
import {
  approxPolygonAreaM2,
  explodeToPolygons,
  pointInPolygonLonLat,
} from "@/lib/maille-clipped-sanity";

export type VoronoiMailleCell = {
  polygons: Polygon[];
  surfaceHa: number;
};

function bboxLonLatPad(
  geom: Polygon | MultiPolygon,
  padRatio: number
): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const scanRing = (ring: number[][]) => {
    for (const p of ring) {
      if (!p || p.length < 2) continue;
      const x = p[0]!;
      const y = p[1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) scanRing(ring);
  } else {
    for (const poly of geom.coordinates) {
      for (const ring of poly) scanRing(ring);
    }
  }
  if (!Number.isFinite(minX)) {
    return [-180, -90, 180, 90];
  }
  const dx = (maxX - minX) * padRatio + 1e-9;
  const dy = (maxY - minY) * padRatio + 1e-9;
  return [minX - dx, minY - dy, maxX + dx, maxY + dy];
}

/**
 * Evite les sites coincidants (Delaunay / Voronoi invalides).
 */
export function jitterDuplicateLonLat(seeds: LonLat[]): LonLat[] {
  const seen = new Map<string, number>();
  return seeds.map(([lon, lat]) => {
    const base = lon.toFixed(9) + "," + lat.toFixed(9);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    if (n === 0) return [lon, lat];
    const eps = 1e-8 * n;
    return [lon + eps * Math.cos(n), lat + eps * Math.sin(n)];
  });
}

function ringToPolygon(ring: [number, number][]): Polygon | null {
  if (!ring || ring.length < 3) return null;
  const coords = ring.map(([x, y]) => [x, y]);
  return { type: "Polygon", coordinates: [coords] };
}

/**
 * Cellules de Voronoi (lon/lat comme plan local), coupees par la parcelle : pas de chevauchement.
 */
export function voronoiMaillesClippedToParcel(
  seeds: LonLat[],
  parcel: Polygon | MultiPolygon
): VoronoiMailleCell[] {
  const n = seeds.length;
  if (n === 0) return [];

  const jittered = jitterDuplicateLonLat(seeds);
  const bbox = bboxLonLatPad(parcel, 0.08);
  const delaunay = Delaunay.from(jittered);
  const voronoi = delaunay.voronoi(bbox);

  const out: VoronoiMailleCell[] = [];

  for (let i = 0; i < n; i++) {
    const centerLon = seeds[i]![0];
    const centerLat = seeds[i]![1];
    const refLat = centerLat;

    const raw = voronoi.cellPolygon(i);
    if (!raw || raw.length < 3) {
      out.push({ polygons: [], surfaceHa: 0 });
      continue;
    }

    const ring = raw as [number, number][];
    const cellPoly = ringToPolygon(ring);
    if (!cellPoly) {
      out.push({ polygons: [], surfaceHa: 0 });
      continue;
    }
    const clipped = clipPolygonToParcelPolygon(cellPoly, parcel);
    if (!clipped) {
      out.push({ polygons: [], surfaceHa: 0 });
      continue;
    }

    const parts = explodeToPolygons(clipped);
    const kept: Polygon[] = [];
    let surfaceHa = 0;

    for (const part of parts) {
      if (!pointInPolygonLonLat(centerLon, centerLat, part)) continue;
      const a = approxPolygonAreaM2(part, refLat);
      if (!Number.isFinite(a) || a <= 0) continue;
      surfaceHa += a / 10000;
      kept.push(part);
    }

    if (kept.length === 0 && parts.length > 0) {
      let best = parts[0]!;
      let bestA = approxPolygonAreaM2(best, refLat);
      for (let j = 1; j < parts.length; j++) {
        const pj = parts[j]!;
        const aj = approxPolygonAreaM2(pj, refLat);
        if (aj > bestA) {
          best = pj;
          bestA = aj;
        }
      }
      if (Number.isFinite(bestA) && bestA > 0) {
        kept.push(best);
        surfaceHa = bestA / 10000;
      }
    }

    out.push({ polygons: kept, surfaceHa });
  }

  return out;
}
