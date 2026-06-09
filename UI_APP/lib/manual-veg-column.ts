/**
 * Colonne CSV : annotation manuelle de veg_cat (true = ne pas ecraser via clusters).
 */

export const VEG_CAT_MANUAL_COL = "veg_cat_manual";

export function rowManualVegLocked(row: Record<string, string>): boolean {
  const v = (row[VEG_CAT_MANUAL_COL] ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function ensureManualColumn(
  records: Record<string, string>[],
  columns: string[]
): string[] {
  let cols = columns;
  if (!cols.includes(VEG_CAT_MANUAL_COL)) {
    cols = [...cols, VEG_CAT_MANUAL_COL];
  }
  for (const r of records) {
    if (r[VEG_CAT_MANUAL_COL] === undefined) r[VEG_CAT_MANUAL_COL] = "";
  }
  return cols;
}
