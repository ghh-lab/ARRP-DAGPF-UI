import type { Db } from "mongodb";
import { parseGsdMetersFromStacProperties } from "@/lib/maille-gsd";

/**
 * Charge properties.gsd (m/px) depuis Mongo stac_items, cle item STAC `id`.
 */
export async function loadGsdMetersByStacId(
  db: Db,
  stacIds: string[],
  collectionName: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const uniq = [
    ...new Set(stacIds.map((s) => String(s).trim()).filter(Boolean)),
  ];
  if (uniq.length === 0) return map;

  const coll = db.collection(collectionName);
  const cursor = coll.find(
    { id: { $in: uniq } },
    { projection: { id: 1, properties: 1 } }
  );

  for await (const doc of cursor) {
    const id = doc.id != null ? String(doc.id) : "";
    if (!id) continue;
    const gsd = parseGsdMetersFromStacProperties(doc.properties);
    if (gsd != null) map.set(id, gsd);
  }

  return map;
}
