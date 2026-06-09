export type VegClassEntry = {
  code: number;
  nom: string;
  groupe: string;
  exemples_libelles?: string[];
};

export type VegClassesFile = {
  schema_version?: string;
  classes: VegClassEntry[];
};

export function nomForCode(
  file: VegClassesFile | null,
  code: number
): string {
  const c = file?.classes?.find((x) => x.code === code);
  return c?.nom ?? "Code " + String(code);
}
