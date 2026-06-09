import type { Feature } from "geojson";
import type { FilterSpecification } from "maplibre-gl";

export const NONE_SENTINEL = "None";

export type FieldFilter = "" | "__none__" | (string & {});

export interface ParcelFilters {
  commune: FieldFilter;
  productionType: FieldFilter;
  typeParcelle: FieldFilter;
  surfaceMin: number;
  surfaceMax: number;
}

const PRODUCTION_TYPE_MANUAL_KEYS = [
  "production_type_manual",
  "manual_production_type",
  "veg_cat_manual_nom",
] as const;

const PRODUCTION_TYPE_MODEL_KEYS = [
  "production_type",
  "veg_cat_nom",
] as const;

function normalizedStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === NONE_SENTINEL) return null;
  return s;
}

function firstValidProp(
  props: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const s = normalizedStringOrNull(props[key]);
    if (s != null) return s;
  }
  return null;
}

function effectiveProductionTypeFromProps(props: Record<string, unknown>): string {
  return (
    firstValidProp(props, PRODUCTION_TYPE_MANUAL_KEYS) ??
    firstValidProp(props, PRODUCTION_TYPE_MODEL_KEYS) ??
    NONE_SENTINEL
  );
}

function effectiveProductionTypeExpr(): FilterSpecification {
  const allKeys = [...PRODUCTION_TYPE_MANUAL_KEYS, ...PRODUCTION_TYPE_MODEL_KEYS];
  let expr: FilterSpecification = NONE_SENTINEL;
  for (let i = allKeys.length - 1; i >= 0; i -= 1) {
    const key = allKeys[i]!;
    expr = [
      "case",
      [
        "all",
        ["has", key],
        ["!=", ["get", key], null],
        ["!=", ["to-string", ["get", key]], ""],
        ["!=", ["to-string", ["get", key]], NONE_SENTINEL],
      ],
      ["to-string", ["get", key]],
      expr,
    ];
  }
  return expr;
}

function fieldClause(
  key: string,
  val: FieldFilter
): FilterSpecification | null {
  if (val === "") return null;
  if (val === "__none__") {
    return ["==", ["get", key], NONE_SENTINEL];
  }
  return ["==", ["get", key], val];
}

/**
 * When no categorical filter and surface range matches the full dataset,
 * return no layer filter so every feature in the GeoJSON source is drawn.
 */
export function filtersMatchFullDataset(
  f: ParcelFilters,
  surfaceRangeFromData: { min: number; max: number }
): boolean {
  if (f.commune !== "" || f.productionType !== "" || f.typeParcelle !== "") {
    return false;
  }
  const eps = 1e-6;
  return (
    f.surfaceMin <= surfaceRangeFromData.min + eps &&
    f.surfaceMax >= surfaceRangeFromData.max - eps
  );
}

export function buildLayerFilter(
  f: ParcelFilters
): FilterSpecification | undefined {
  const clauses: FilterSpecification[] = [];

  const c1 = fieldClause("commune", f.commune);
  if (c1) clauses.push(c1);
  if (f.productionType !== "") {
    if (f.productionType === "__none__") {
      clauses.push(["==", effectiveProductionTypeExpr(), NONE_SENTINEL]);
    } else {
      clauses.push(["==", effectiveProductionTypeExpr(), f.productionType]);
    }
  }
  const c3 = fieldClause("type_parcelle", f.typeParcelle);
  if (c3) clauses.push(c3);

  clauses.push([">=", ["get", "surface_ha"], f.surfaceMin]);
  clauses.push(["<=", ["get", "surface_ha"], f.surfaceMax]);

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return ["all", ...clauses];
}

export function strProp(v: unknown): string {
  if (v === null || v === undefined) return NONE_SENTINEL;
  if (typeof v === "string") return v;
  return String(v);
}

export function numProp(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

export function featureMatchesFilters(
  feature: Feature,
  f: ParcelFilters
): boolean {
  if (feature.properties === null || feature.properties === undefined) {
    return false;
  }
  const p = feature.properties;

  if (f.commune !== "") {
    const comm = strProp(p.commune);
    if (f.commune === "__none__") {
      if (comm !== NONE_SENTINEL) return false;
    } else if (comm !== f.commune) {
      return false;
    }
  }

  if (f.productionType !== "") {
    const pt = effectiveProductionTypeFromProps(p);
    if (f.productionType === "__none__") {
      if (pt !== NONE_SENTINEL) return false;
    } else if (pt !== f.productionType) {
      return false;
    }
  }

  if (f.typeParcelle !== "") {
    const tp = strProp(p.type_parcelle);
    if (f.typeParcelle === "__none__") {
      if (tp !== NONE_SENTINEL) return false;
    } else if (tp !== f.typeParcelle) {
      return false;
    }
  }

  const s = numProp(p.surface_ha);
  if (s < f.surfaceMin || s > f.surfaceMax) return false;
  return true;
}

export function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
}

export function collectDistinctField(
  features: Feature[],
  key: "commune" | "production_type" | "type_parcelle"
): string[] {
  const out: string[] = [];
  for (const f of features) {
    if (!f.properties) continue;
    let s: string;
    if (key === "production_type") {
      s = effectiveProductionTypeFromProps(f.properties as Record<string, unknown>);
    } else {
      const raw = f.properties[key];
      s = strProp(raw);
    }
    if (s !== NONE_SENTINEL) out.push(s);
  }
  return uniqueSortedStrings(out);
}

export function fieldHasNone(
  features: Feature[],
  key: "commune" | "production_type" | "type_parcelle"
): boolean {
  for (const f of features) {
    if (!f.properties) continue;
    const val =
      key === "production_type"
        ? effectiveProductionTypeFromProps(f.properties as Record<string, unknown>)
        : strProp(f.properties[key]);
    if (val === NONE_SENTINEL) return true;
  }
  return false;
}

export function surfaceRange(features: Feature[]): {
  min: number;
  max: number;
} {
  let min = Infinity;
  let max = -Infinity;
  for (const f of features) {
    if (!f.properties) continue;
    const s = numProp(f.properties.surface_ha);
    if (s < min) min = s;
    if (s > max) max = s;
  }
  if (min === Infinity) return { min: 0, max: 1 };
  if (max <= min) return { min, max: min + 1 };
  return { min, max };
}
