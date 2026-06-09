export type ClusterLabelEntry = {
  vegCat: number;
  displayName: string;
};

export type ClusterLabelsFile = {
  labels: Record<string, ClusterLabelEntry>;
};
