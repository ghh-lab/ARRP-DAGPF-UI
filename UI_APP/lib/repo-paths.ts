import path from "path";

/**
 * Dag_IA repo root: parent of UI_APP when dev server cwd is UI_APP, else cwd when
 * dev is started from repo root.
 */
export function resolveRepoRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "UI_APP") {
    return path.resolve(cwd, "..");
  }
  return cwd;
}

const JUNGLE_VECTORS_REL = [
  "Backend",
  "3_Mongo_Spectral_Stac",
  "vectors_with_mongo_stac.csv",
] as const;

/**
 * Absolute path to Backend/3_Mongo_Spectral_Stac/vectors_with_mongo_stac.csv
 * (after step 2 G-means + step 3 Mongo enrich).
 * Override with env JUNGLE_VECTORS_CSV for deployments.
 */
export function jungleVectorsCsvPath(): string {
  const override = process.env.JUNGLE_VECTORS_CSV;
  if (override != null && override !== "") {
    return path.resolve(override);
  }
  return path.join(resolveRepoRoot(), ...JUNGLE_VECTORS_REL);
}
