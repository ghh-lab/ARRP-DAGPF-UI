/**
 * Couleurs des graphiques veg_cat : une teinte associee a chaque code
 * (reference classes_plantations_polynesie.json).
 */

const BY_CODE: Record<number, string> = {
  1: "#ca8a04",
  2: "#78350f",
  3: "#ea580c",
  4: "#65a30d",
  5: "#f59e0b",
  6: "#57534e",
  7: "#422006",
  8: "#0d9488",
  9: "#fb923c",
  10: "#9333ea",
  11: "#a16207",
  12: "#ec4899",
  13: "#fbbf24",
  14: "#3f6212",
  15: "#4a5d23",
  16: "#db2777",
  17: "#a8a29e",
  18: "#be185d",
  19: "#14532d",
  20: "#475569",
  21: "#94a3b8",
  22: "#0891b2",
  23: "#64748b",
  24: "#c084fc",
  25: "#44403c",
};

const UNKNOWN_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#e11d48",
  "#14b8a6",
  "#eab308",
  "#f97316",
];

/** Mailles sans classe valide (camembert). */
export const COLOR_NON_ETIQ = "#78716e";

export function fillForVegCatCode(code: number | null): string {
  if (code === null) return COLOR_NON_ETIQ;
  const hit = BY_CODE[code];
  if (hit) return hit;
  const i = Math.abs(code) % UNKNOWN_PALETTE.length;
  return UNKNOWN_PALETTE[i];
}
