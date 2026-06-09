import type { FeatureCollection } from "geojson";
import type { ClusterImageryHints } from "@/lib/stac";

/**
 * Aggregate dominant COG and acquisition date from cluster GeoJSON features
 * (requires step2_cog_id / acquisition_date on features, see build_cluster_geojson.py).
 */
export function clusterImageryHintsFromGeojson(
  fc: FeatureCollection | null,
  clusterId: number | null
): ClusterImageryHints | null {
  if (clusterId == null || !fc) return null;
  const cogs: Record<string, number> = {};
  const dates: Record<string, number> = {};
  for (const f of fc.features) {
    const p = f.properties as {
      cluster_id?: number;
      step2_cog_id?: string;
      acquisition_date?: string;
    };
    if (p.cluster_id !== clusterId) continue;
    const cog = String(p.step2_cog_id ?? "").trim();
    if (cog) cogs[cog] = (cogs[cog] ?? 0) + 1;
    const d = String(p.acquisition_date ?? "").trim();
    if (d) dates[d] = (dates[d] ?? 0) + 1;
  }
  const cogEntries = Object.entries(cogs).sort((a, b) => b[1] - a[1]);
  const dateEntries = Object.entries(dates).sort((a, b) => b[1] - a[1]);
  const dominantCog = cogEntries[0]?.[0] ?? null;
  const dominantDate = dateEntries[0]?.[0] ?? null;
  const allCogs = Object.keys(cogs);
  if (allCogs.length === 0 && !(dominantDate && dominantDate.length > 0)) {
    return null;
  }
  return { dominantCog, dominantDate, allCogs };
}
