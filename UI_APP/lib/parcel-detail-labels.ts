/**
 * French labels for DAG parcel properties (UI display).
 */

export const PARCEL_PROPERTY_LABELS: Record<string, string> = {
  _id: "Identifiant",
  parcel_id: "ID parcelle",
  feature_index: "Index",
  num_lot: "Numero de lot",
  object_id: "ID objet",
  global_id: "Global ID",
  commune: "Commune",
  surface_ha: "Surface (ha)",
  surface_km2: "Surface (km2)",
  production_type: "Type de production",
  type_parcelle: "Type de parcelle",
  nature_sol: "Nature du sol",
  etat_lot: "Etat du lot",
  etat_cheptel: "Etat du cheptel",
  classification_status: "Statut de classification",
  observations: "Observations",
};

export function labelForPropertyKey(key: string): string {
  return PARCEL_PROPERTY_LABELS[key] ?? key;
}

export function formatPropertyValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && (v === "None" || v === "")) {
    return "Non renseigne";
  }
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1e6) / 1e6);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
