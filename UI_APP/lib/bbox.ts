import type { Feature, FeatureCollection } from "geojson";

export function bboxFromFeature(
  f: Feature
): [number, number, number, number] | null {
  const g = f.geometry;
  if (!g) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const extendRing = (ringCoords: number[][]) => {
    for (const c of ringCoords) {
      const lng = c[0];
      const lat = c[1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };

  if (g.type === "Polygon") {
    for (const ring of g.coordinates) {
      extendRing(ring);
    }
  } else if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates) {
      for (const ring of poly) {
        extendRing(ring);
      }
    }
  } else {
    return null;
  }

  if (
    minLng === Infinity ||
    minLat === Infinity ||
    maxLng === -Infinity ||
    maxLat === -Infinity
  ) {
    return null;
  }

  return [minLng, minLat, maxLng, maxLat];
}

export function bboxFromFeatureCollection(
  fc: FeatureCollection
): [[number, number], [number, number]] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const extendRing = (ringCoords: number[][]) => {
    for (const c of ringCoords) {
      const lng = c[0];
      const lat = c[1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };

  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") {
      for (const ring of g.coordinates) {
        extendRing(ring);
      }
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates) {
        for (const ring of poly) {
          extendRing(ring);
        }
      }
    }
  }

  if (
    minLng === Infinity ||
    minLat === Infinity ||
    maxLng === -Infinity ||
    maxLat === -Infinity
  ) {
    return [
      [-150, -23],
      [-150, -22],
    ];
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
