/** bbox [west, south, east, north] en WGS84 */
export function pointInBbox(
  lon: number,
  lat: number,
  bbox: readonly [number, number, number, number]
): boolean {
  const [w, s, e, n] = bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

export function pointInAnyBbox(
  lon: number,
  lat: number,
  boxes: readonly (readonly [number, number, number, number])[]
): boolean {
  for (const b of boxes) {
    if (pointInBbox(lon, lat, b)) return true;
  }
  return false;
}
