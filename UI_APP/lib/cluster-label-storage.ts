import fs from "fs";
import path from "path";
import type { ClusterLabelsFile } from "@/lib/cluster-label-types";

export type { ClusterLabelEntry } from "@/lib/cluster-label-types";

export function labelsJsonPath(): string {
  return path.join(process.cwd(), "public", "data", "cluster_labels.json");
}

export function readClusterLabelsFile(): ClusterLabelsFile {
  const p = labelsJsonPath();
  if (!fs.existsSync(p)) {
    return { labels: {} };
  }
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw) as ClusterLabelsFile;
    if (!j.labels || typeof j.labels !== "object") return { labels: {} };
    return j;
  } catch {
    return { labels: {} };
  }
}

export function writeClusterLabelsFile(data: ClusterLabelsFile): void {
  const p = labelsJsonPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}
