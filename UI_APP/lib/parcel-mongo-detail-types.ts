import type { FeatureCollection } from "geojson";

export type ParcelMongoCategoryEntry = {
  /** Code couleur / legende : veg_cat JSON ou 10000+classe Mongo si hors catalogue. */
  category_id: number;
  /** Libelle canonique (meme source Mongo ou CSV manuel si meme culture). */
  category_name: string;
  cells: number;
  surfaceHa: number;
};

export type ParcelMongoDetailOk = {
  ok: true;
  /** Moyenne ha/maille (cellules Voronoi coupees parcelle). */
  cellSurfaceHa: number;
  totalCells: number;
  entries: ParcelMongoCategoryEntry[];
  overlay: FeatureCollection;
};

export type ParcelMongoDetailResponse =
  | ParcelMongoDetailOk
  | { ok: false; error: string };
