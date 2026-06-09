/**
 * surface_km2 DAG ou surface_ha / 100 (1 km² = 100 ha).
 */
export function parcelSurfaceKm2FromProps(
  props: Record<string, unknown> | null | undefined
): number | null {
  if (!props) return null;
  const km = props.surface_km2;
  if (typeof km === "number" && Number.isFinite(km) && km > 0) return km;
  const ha = props.surface_ha;
  if (typeof ha === "number" && Number.isFinite(ha) && ha > 0) return ha / 100;
  return null;
}
