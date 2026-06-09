/**
 * Carre lon/lat ; surface areaM2 (m²) = cote^2 avec cote = gsd x 64 typiquement.
 */
import type { Polygon } from "geojson";

export type LonLat = [number, number];

function metersToDegreesOffsets(
  lat: number,
  meters: number
): { dLon: number; dLat: number } {
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.max(0.2, Math.cos(latRad));
  return {
    dLat: meters / 111320,
    dLon: meters / (111320 * cosLat),
  };
}

/**
 * Carre centre sur le point ; demi-cote = sqrt(areaM2)/2 metres (projection locale).
 */
export function squarePolygonFromPointFixedArea(
  center: LonLat,
  areaM2: number
): Polygon {
  const sideM = Math.sqrt(Math.max(0, areaM2));
  const halfM = sideM / 2;
  const [lon, lat] = center;
  const { dLon, dLat } = metersToDegreesOffsets(lat, halfM);
  const ring: LonLat[] = [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
  return { type: "Polygon", coordinates: [ring] };
}
