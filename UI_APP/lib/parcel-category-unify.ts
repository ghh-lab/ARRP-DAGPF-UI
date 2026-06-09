/**
 * Harmonise etiquettes et code couleur camembert/carte entre Mongo IA et veg_cat CSV.
 * Priorite : correspondance insensible a la casse avec classes_plantations_polynesie.json.
 */

export type UnifiedParcelCategory = {
  /** Libelle affiche (orthographe du JSON si reconnu). */
  displayName: string;
  /** Argument unique pour fillForVegCatCode (code veg ou 10000+id Mongo si inconnu). */
  chartCode: number;
};

export function unifyParcelCategory(
  nomByCode: Map<number, string>,
  categoryName: string,
  rawId: number,
  source: "mongo" | "veg_csv"
): UnifiedParcelCategory {
  const trimmed = categoryName.trim();
  const lower = trimmed.toLowerCase();

  for (const [code, nom] of nomByCode) {
    if (nom.trim().toLowerCase() === lower) {
      return { displayName: nom, chartCode: code };
    }
  }

  if (source === "veg_csv") {
    const fromCode = nomByCode.get(rawId);
    const displayName =
      trimmed || (fromCode != null ? fromCode : "Code " + String(rawId));
    return { displayName, chartCode: rawId };
  }

  const mongoChart = 10000 + Math.max(0, rawId);
  return {
    displayName: trimmed || "Classe " + String(rawId),
    chartCode: mongoChart,
  };
}
