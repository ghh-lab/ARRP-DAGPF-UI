export type StacTileStyle = "natural" | "ndvi" | "urban";

export type StacOverlayState = {
  tilesUrl: string;
  itemId: string;
  style: StacTileStyle;
};

export function getStacApiBase(): string {
  // Browser-side tile requests must stay same-origin to avoid leaking
  // localhost URLs when the app is accessed through another hostname.
  if (typeof window !== "undefined") return "/api/stac";
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_STAC_API_URL
      ? process.env.NEXT_PUBLIC_STAC_API_URL
      : "http://127.0.0.1:39055";
  return raw.replace(/\/$/, "");
}

export function buildRasterTilesUrl(
  apiBase: string,
  cogHref: string,
  style: StacTileStyle,
  bitsPerPixel?: number
): string {
  const base = apiBase.replace(/\/$/, "");
  const q = new URLSearchParams();
  q.set("url", cogHref);
  q.set("style", style);
  if (bitsPerPixel != null && Number.isFinite(bitsPerPixel)) {
    q.set("bits_per_pixel", String(Math.round(bitsPerPixel)));
  }
  return `${base}/tiles/{z}/{x}/{y}?${q.toString()}`;
}

type LooseAssets = {
  mul?: { href?: string };
};

export function cogHrefFromStacFeature(f: {
  assets?: LooseAssets;
}): string | null {
  const href = f.assets?.mul?.href;
  if (typeof href === "string" && href.length > 0) return href;
  return null;
}

export function bitsPerPixelFromStacFeature(f: {
  properties?: Record<string, unknown>;
}): number | undefined {
  const v = f.properties?.["eo:bits_per_pixel"];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

export function parseStacDatetime(iso: string | null | undefined): number {
  if (!iso || typeof iso !== "string") return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Dominant COG / date among vectors of the selected cluster (from GeoJSON props). */
export type ClusterImageryHints = {
  dominantCog: string | null;
  dominantDate: string | null;
  allCogs: string[];
};

type StacItemPick = {
  id: string;
  properties?: { datetime?: string };
  assets?: LooseAssets;
};

/**
 * Prefer STAC items whose COG URL matches cluster vectors (dominant COG, then any),
 * then acquisition date; tie-break by newest scene time.
 */
export function pickStacItemForCluster(
  items: StacItemPick[],
  hints: ClusterImageryHints | null
): StacItemPick | null {
  if (items.length === 0) return null;
  const byNewest = [...items].sort(
    (a, b) =>
      parseStacDatetime(b.properties?.datetime) -
      parseStacDatetime(a.properties?.datetime)
  );
  if (
    !hints ||
    (hints.allCogs.length === 0 &&
      !(hints.dominantDate && hints.dominantDate.length > 0))
  ) {
    return byNewest[0];
  }

  const score = (it: StacItemPick): number => {
    const href = cogHrefFromStacFeature(it) ?? "";
    const iso = it.properties?.datetime ?? "";
    const day = iso.length >= 10 ? iso.slice(0, 10) : "";
    let s = 0;
    if (hints.dominantCog && hints.dominantCog.length > 0) {
      if (href.includes(hints.dominantCog)) s = 1000;
    }
    if (s < 500) {
      for (const c of hints.allCogs) {
        if (c && c.length > 0 && href.includes(c)) {
          s = 500;
          break;
        }
      }
    }
    if (hints.dominantDate && hints.dominantDate.length > 0) {
      if (day === hints.dominantDate) s += 100;
    }
    return s;
  };

  const ranked = [...items].sort((a, b) => {
    const sb = score(b);
    const sa = score(a);
    if (sb !== sa) return sb - sa;
    return (
      parseStacDatetime(b.properties?.datetime) -
      parseStacDatetime(a.properties?.datetime)
    );
  });
  return ranked[0];
}
