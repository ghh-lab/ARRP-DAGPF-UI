/**
 * Ex. 2025-07-22T... -> "22 juil 2025" (decoupe YYYY-MM-DD si possible, sans decalage fuseau).
 */
export function formatAcquisitionDateFr(iso: string): string {
  const ds = iso.trim();
  const dm = ds.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let day: number;
  let monthIdx: number;
  let year: number;
  if (dm) {
    year = Number.parseInt(dm[1], 10);
    monthIdx = Number.parseInt(dm[2], 10) - 1;
    day = Number.parseInt(dm[3], 10);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(monthIdx) ||
      monthIdx < 0 ||
      monthIdx > 11 ||
      !Number.isFinite(day)
    ) {
      return iso;
    }
  } else {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    day = d.getDate();
    year = d.getFullYear();
    monthIdx = d.getMonth();
  }
  const months = [
    "janv",
    "fevr",
    "mars",
    "avr",
    "mai",
    "juin",
    "juil",
    "aout",
    "sept",
    "oct",
    "nov",
    "dec",
  ];
  const m = months[monthIdx];
  return String(day) + " " + m + " " + String(year);
}
