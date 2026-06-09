/**
 * Periode semestrielle (S1 / S2 / Y) alignee sur le CSV jungle et les dates STAC.
 */

/**
 * YYYY-S1 | YYYY-S2 | YYYY-Y (annee seule sans mois/jour precis).
 */
export function semesterKeyFromRow(
  row: Record<string, string>
): string | null {
  const ds = (row.acquisition_date ?? "").trim();
  const dm = ds.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (dm) {
    const y = Number.parseInt(dm[1], 10);
    const mo = Number.parseInt(dm[2], 10);
    if (!Number.isFinite(y)) return null;
    if (mo >= 1 && mo <= 6) return String(y) + "-S1";
    if (mo >= 7 && mo <= 12) return String(y) + "-S2";
    return null;
  }
  const moStr = (row.acquisition_month ?? "").trim();
  const mo = Number.parseInt(moStr, 10);
  const yStr = (row.acquisition_year ?? "").trim();
  const y = Number.parseInt(yStr, 10);
  if (Number.isFinite(y) && mo >= 1 && mo <= 6) return String(y) + "-S1";
  if (Number.isFinite(y) && mo >= 7 && mo <= 12) return String(y) + "-S2";
  if (Number.isFinite(y) && !Number.isFinite(mo)) return String(y) + "-Y";
  return null;
}

/**
 * Meme regle S1/S2 que le CSV, a partir d une date ISO (ex. STAC properties.datetime).
 */
export function semesterKeyFromIsoDatetime(
  iso: string | null | undefined
): string | null {
  if (iso == null || typeof iso !== "string") return null;
  const ds = iso.trim();
  const dm = ds.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (!dm) return null;
  const y = Number.parseInt(dm[1], 10);
  const mo = Number.parseInt(dm[2], 10);
  if (!Number.isFinite(y)) return null;
  if (mo >= 1 && mo <= 6) return String(y) + "-S1";
  if (mo >= 7 && mo <= 12) return String(y) + "-S2";
  return null;
}

export function labelForSemesterKey(key: string): string {
  const m = key.match(/^(\d{4})-(S1|S2|Y)$/);
  if (!m) return key;
  const y = m[1];
  if (m[2] === "S1") return y + " — 1er semestre (janv.–juin)";
  if (m[2] === "S2") return y + " — 2e semestre (juil.–dec.)";
  return y + " — annee complete (sans jour dans le CSV)";
}

/** Plus recent en premier : annee desc, puis S2, S1, Y. */
export function compareSemesterKeys(a: string, b: string): number {
  const pa = a.match(/^(\d{4})-(S1|S2|Y)$/);
  const pb = b.match(/^(\d{4})-(S1|S2|Y)$/);
  if (!pa || !pb) return a.localeCompare(b);
  const ya = Number.parseInt(pa[1], 10);
  const yb = Number.parseInt(pb[1], 10);
  if (ya !== yb) return yb - ya;
  const rank = (k: string) => (k === "S2" ? 2 : k === "S1" ? 1 : 0);
  return rank(pb[2]) - rank(pa[2]);
}
