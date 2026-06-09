import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const srcPath = path.join(repoRoot, "DATA", "DAG.16_07_2025.json");
const outDir = path.join(__dirname, "..", "public", "data");
const outPath = path.join(outDir, "parcels.geojson");

const raw = JSON.parse(fs.readFileSync(srcPath, "utf8"));
if (!Array.isArray(raw)) {
  throw new Error("Expected top-level JSON array");
}

const features = raw.map((item) => {
  const { geometry, ...rest } = item;
  return {
    type: "Feature",
    geometry,
    properties: rest,
  };
});

const fc = {
  type: "FeatureCollection",
  features,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(fc));
console.log("Wrote", outPath, "features:", features.length);
