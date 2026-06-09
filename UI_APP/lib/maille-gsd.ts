/**
 * Maille = patch image 64 x 64 px au sol ; GSD en m/px depuis stac_items.properties.gsd.
 */
import { AI_MAILLE_SIDE_M } from "@/lib/cluster-types";

export const VECTOR_PATCH_PIXELS = 64;

export function mailleSideMetersFromGsd(gsdMeters: number): number {
  const g = Number(gsdMeters);
  if (!Number.isFinite(g) || g <= 0) return AI_MAILLE_SIDE_M;
  return g * VECTOR_PATCH_PIXELS;
}

export function mailleAreaM2FromSideM(sideM: number): number {
  const s = Number(sideM);
  if (!Number.isFinite(s) || s <= 0) return AI_MAILLE_SIDE_M * AI_MAILLE_SIDE_M;
  return s * s;
}

export function mailleSurfaceHaFromSideM(sideM: number): number {
  return mailleAreaM2FromSideM(sideM) / 10000;
}

export function parseGsdMetersFromStacProperties(
  properties: unknown
): number | null {
  if (!properties || typeof properties !== "object") return null;
  const raw = (properties as { gsd?: unknown }).gsd;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
