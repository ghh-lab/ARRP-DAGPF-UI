/** Cell edge length (m): one vector = one 10 m x 10 m square centered on its point. */
export const CLUSTER_CELL_SIDE_M = 10;

/** Reference footprint per counted vector (m^2). */
export const CLUSTER_CELL_AREA_SQM =
  CLUSTER_CELL_SIDE_M * CLUSTER_CELL_SIDE_M;

/** One spectral vector cell surface in hectares (10 m x 10 m). */
export const VECTOR_CELL_SURFACE_HA = CLUSTER_CELL_AREA_SQM / 10000;

/**
 * Fallback cote maille (m) pour stats Mongo globales si GSD STAC absent.
 * Carte parcelle : cote = sqrt(surface_parcelle_m2 / N_points), pas ce fallback.
 */
export const AI_MAILLE_SIDE_M = 42;

export const AI_MAILLE_SURFACE_M2 = AI_MAILLE_SIDE_M * AI_MAILLE_SIDE_M;

export const AI_MAILLE_SURFACE_HA = AI_MAILLE_SURFACE_M2 / 10000;

export type ClusterRankingEntry = {
  clusterId: number;
  count: number;
};
export type ClusterRankingFile = {
  generated_from?: string;
  rows_used?: number;
  rows_skipped?: number;
  ranking: ClusterRankingEntry[];
  spatial_diagnostic?: {
    step2_center_vs_dag_parcel_polygon?: {
      n_inside: number;
      n_outside: number;
      pct_inside: number;
    };
    vl_center_vs_parcel_polygon_same_dag_id?: {
      n_inside: number;
      n_outside: number;
      pct_inside: number;
    };
    interpretation?: string;
  };
};
