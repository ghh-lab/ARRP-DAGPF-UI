import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { resolveRepoRoot } from "@/lib/repo-paths";

type ReportRow = {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
};

type RunsHistoryEntry = {
  run_id?: number;
  folder?: string;
  macro_f1?: number;
  accuracy?: number;
  model?: string;
};

function readJsonIfExists<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseClassificationReport(reportText: string): ReportRow[] {
  const rows: ReportRow[] = [];
  const lines = reportText.split(/\r?\n/);
  const re = /^\s*(.+?)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9]+)\s*$/;
  for (const line of lines) {
    const m = re.exec(line);
    if (!m) continue;
    const label = m[1].trim();
    if (
      label === "accuracy" ||
      label === "macro avg" ||
      label === "weighted avg"
    ) {
      continue;
    }
    rows.push({
      label,
      precision: Number(m[2]),
      recall: Number(m[3]),
      f1: Number(m[4]),
      support: Number(m[5]),
    });
  }
  return rows;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireClientRole();
    if (!auth.ok) return auth.response;
    const repoRoot = resolveRepoRoot();
    const bestDir = path.join(repoRoot, "Backend", "5_final_model", "output", "best");
    const classesPath = path.join(
      repoRoot,
      "Public_Data",
      "classes_plantations_polynesie.json"
    );

    const metrics = readJsonIfExists<Record<string, unknown>>(
      path.join(bestDir, "metrics.json")
    );
    const runMeta = readJsonIfExists<Record<string, unknown>>(
      path.join(bestDir, "run_meta.json")
    );
    const bestHyper = readJsonIfExists<Record<string, unknown>>(
      path.join(bestDir, "best_hyperparameters.json")
    );

    const sourceRunPath = path.join(bestDir, "best_source_run.txt");
    const sourceRun = fs.existsSync(sourceRunPath)
      ? fs.readFileSync(sourceRunPath, "utf-8")
      : "";

    const reportPath = path.join(bestDir, "classification_report.txt");
    const reportText = fs.existsSync(reportPath)
      ? fs.readFileSync(reportPath, "utf-8")
      : "";
    const reportRows = parseClassificationReport(reportText);
    const runsHistory =
      readJsonIfExists<RunsHistoryEntry[]>(
        path.join(repoRoot, "Backend", "5_final_model", "output", "runs_history.json")
      ) ?? [];

    const classesRaw = readJsonIfExists<{
      schema_version?: string;
      territoire?: string;
      description?: string;
      classes?: {
        code?: number;
        nom?: string;
        groupe?: string;
        exemples_libelles?: string[];
      }[];
    }>(classesPath);

    const classes = (classesRaw?.classes ?? []).filter(
      (c) => typeof c.code === "number" && typeof c.nom === "string"
    );
    const groups = new Map<
      string,
      { name: string; count: number; items: typeof classes }
    >();
    for (const c of classes) {
      const groupName = typeof c.groupe === "string" ? c.groupe : "Sans groupe";
      const slot = groups.get(groupName) ?? {
        name: groupName,
        count: 0,
        items: [],
      };
      slot.count += 1;
      slot.items.push(c);
      groups.set(groupName, slot);
    }

    const groupsList = [...groups.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => ({
        name: g.name,
        count: g.count,
        classes: g.items.sort((a, b) => (a.code ?? 0) - (b.code ?? 0)),
      }));

    return NextResponse.json({
      model: {
        available: Boolean(metrics || runMeta || bestHyper || reportText),
        sourceRunText: sourceRun.trim(),
        runMeta,
        metrics,
        bestHyperparameters: bestHyper,
        runsHistory,
        reportText,
        reportRows,
      },
      classes: {
        available: Boolean(classesRaw),
        schemaVersion: classesRaw?.schema_version ?? null,
        territoire: classesRaw?.territoire ?? null,
        description: classesRaw?.description ?? null,
        totalClasses: classes.length,
        groups: groupsList,
      },
    });
  } catch (e) {
    return sanitizeErrorResponse("model-insights.GET", e);
  }
}
