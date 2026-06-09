"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { VegCatPieChart, type VegCatPieSlice } from "@/components/veg-cat-pie-chart";

type MongoAiStatsOk = {
  ok: true;
  cellSurfaceHa: number;
  totalDocuments: number;
  analyzedDocuments: number;
  avgAccuracyPercent: number | null;
  byCategory: Array<{
    category_id: number;
    category_name: string;
    cells: number;
    surfaceHa: number;
  }>;
  evolutionLines: Array<{
    code: number;
    nom: string;
  }>;
  evolutionBySemester: Array<
    {
      semesterKey: string;
      semesterLabel: string;
      totalSurfaceHa: number;
    } & Record<string, string | number>
  >;
};

type MongoAiStatsResponse = MongoAiStatsOk | { ok: false; error: string };

const BAR_CATEGORY_FILL = "#059669";
const EVO_LINE_COLORS = [
  "#059669",
  "#2563eb",
  "#ea580c",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#b45309",
];

export function ChartsPanel() {
  const [mongoStats, setMongoStats] = useState<MongoAiStatsResponse | null>(
    null
  );
  const [mongoLoading, setMongoLoading] = useState(true);
  const [mongoError, setMongoError] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setMongoLoading(true);
      setMongoError(null);
      try {
        const res = await fetch("/api/mongo-ai-stats", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setMongoStats(null);
            setMongoError("HTTP " + String(res.status));
          }
          return;
        }
        const j = (await res.json()) as MongoAiStatsResponse;
        if (cancelled) return;
        if (j.ok) {
          setMongoStats(j);
          setMongoError(null);
        } else {
          setMongoStats(null);
          setMongoError(j.error ?? "mongo_stats_error");
        }
      } catch (e) {
        if (!cancelled) {
          setMongoStats(null);
          setMongoError(
            e instanceof Error ? e.message : "Erreur statistiques MongoDB (IA)"
          );
        }
      } finally {
        if (!cancelled) setMongoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mongoStats || !mongoStats.ok) return;
    const semesters = mongoStats.evolutionBySemester;
    if (semesters.length === 0) return;
    const latest = semesters[semesters.length - 1];
    if (!latest) return;
    const latestKey = String(latest.semesterKey);
    const exists = semesters.some((s) => String(s.semesterKey) === selectedSemester);
    if (!exists) setSelectedSemester(latestKey);
  }, [mongoStats, selectedSemester]);

  const mongoPieSlices = useMemo((): VegCatPieSlice[] => {
    if (!mongoStats || !mongoStats.ok || mongoStats.byCategory.length === 0) {
      return [];
    }
    const sem = mongoStats.evolutionBySemester.find(
      (s) => s.semesterKey === selectedSemester
    );
    const rows = sem
      ? mongoStats.evolutionLines
          .map((ln) => {
            const ha = Number(sem[String(ln.code)] ?? 0);
            return {
              category_id: ln.code,
              category_name: ln.nom,
              surfaceHa: Number.isFinite(ha) ? ha : 0,
              cells: 0,
            };
          })
          .filter((r) => r.surfaceHa > 0)
      : mongoStats.byCategory;
    return rows.map((r) => ({
      name: r.category_name + " (id " + String(r.category_id) + ")",
      value: r.surfaceHa,
      tooltipHa: r.surfaceHa,
      vegCode: 10000 + (r.category_id >= 0 ? r.category_id : 0),
    }));
  }, [mongoStats, selectedSemester]);

  const mongoBarRows = useMemo(() => {
    if (!mongoStats || !mongoStats.ok) return [];
    const sem = mongoStats.evolutionBySemester.find(
      (s) => s.semesterKey === selectedSemester
    );
    const rows = sem
      ? mongoStats.evolutionLines
          .map((ln) => {
            const ha = Number(sem[String(ln.code)] ?? 0);
            const surfaceHa = Number.isFinite(ha) ? ha : 0;
            return {
              category_id: ln.code,
              category_name: ln.nom,
              surfaceHa,
              cells:
                mongoStats.cellSurfaceHa > 0
                  ? Math.round(surfaceHa / mongoStats.cellSurfaceHa)
                  : 0,
            };
          })
          .filter((r) => r.surfaceHa > 0)
      : mongoStats.byCategory;
    return rows.map((r) => ({
      label:
        r.category_name.length > 28
          ? r.category_name.slice(0, 26) + "..."
          : r.category_name,
      surfaceHa: r.surfaceHa,
      cells: r.cells,
    }));
  }, [mongoStats, selectedSemester]);

  const evolutionTopLines = useMemo(() => {
    if (!mongoStats || !mongoStats.ok) return [];
    const bySurface = [...mongoStats.byCategory]
      .sort((a, b) => b.surfaceHa - a.surfaceHa)
      .slice(0, 6)
      .map((r) => r.category_id);
    const allowed = new Set(bySurface);
    return mongoStats.evolutionLines.filter((l) => allowed.has(l.code));
  }, [mongoStats]);

  const evolutionRows = useMemo(() => {
    if (!mongoStats || !mongoStats.ok) return [];
    return mongoStats.evolutionBySemester;
  }, [mongoStats]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-y-auto px-6 pb-10 pt-4 text-emerald-950">
      <section className="space-y-3" data-tour="charts-surfaces">
        <h3 className="text-sm font-medium">Surfaces par classe (IA)</h3>
        {mongoStats != null && mongoStats.ok && mongoStats.evolutionBySemester.length > 0 ? (
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="semester-filter" className="text-emerald-900">
              Semestre:
            </label>
            <select
              id="semester-filter"
              className="rounded border border-emerald-800/25 bg-white px-2 py-1 text-xs text-emerald-950"
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
            >
              {mongoStats.evolutionBySemester.map((s) => (
                <option key={s.semesterKey} value={String(s.semesterKey)}>
                  {String(s.semesterLabel)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {mongoLoading ? (
          <p className="text-sm text-emerald-700">Chargement MongoDB...</p>
        ) : mongoError ? (
          <p className="text-sm text-amber-800">
            MongoDB indisponible ({mongoError}). Verifie la connexion ou les
            variables MONGO_URI / MONGO_DB / MONGO_AI_COLLECTION.
          </p>
        ) : mongoPieSlices.length === 0 ? (
          <p className="text-sm text-emerald-700">
            Aucune categorie IA dans MongoDB, ou collection vide.
          </p>
        ) : (
          <div className="h-[min(22rem,38vh)] min-h-[14rem] w-full">
            <VegCatPieChart data={mongoPieSlices} />
          </div>
        )}
      </section>

      {mongoStats != null &&
        mongoStats.ok &&
        evolutionRows.length > 0 &&
        evolutionTopLines.length > 0 &&
        !mongoLoading &&
        !mongoError && (
          <section data-tour="charts-evolution">
            <h3 className="mb-2 text-sm font-medium">Evolution temporelle des surfaces (ha)</h3>
            <p className="mb-2 text-[11px] text-emerald-800/85">
              Courbe par semestre (S1/S2), priorite labels manuels puis modele.
            </p>
            <div className="h-[min(24rem,46vh)] min-h-[15rem] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionRows} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="semesterKey" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={(v) =>
                      typeof v === "number"
                        ? v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
                        : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(value) => {
                      const ha =
                        typeof value === "number"
                          ? value
                          : Number.parseFloat(String(value));
                      const haOk = Number.isFinite(ha) ? ha : 0;
                      return [
                        haOk.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " ha",
                        "Surface",
                      ];
                    }}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload as
                        | { semesterLabel?: string }
                        | undefined;
                      return row?.semesterLabel ?? String(label);
                    }}
                  />
                  <Legend />
                  {evolutionTopLines.map((ln, i) => (
                    <Line
                      key={ln.code}
                      type="monotone"
                      dataKey={String(ln.code)}
                      name={ln.nom}
                      stroke={EVO_LINE_COLORS[i % EVO_LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="totalSurfaceHa"
                    name="Total"
                    stroke="#111827"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

      {mongoStats != null &&
        mongoStats.ok &&
        mongoBarRows.length > 0 &&
        !mongoLoading &&
        !mongoError && (
          <section data-tour="charts-bars">
            <h3 className="mb-2 text-sm font-medium">
              Surfaces par classe (barres, ha)
            </h3>
            <div className="h-[min(22rem,45vh)] min-h-[14rem] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mongoBarRows}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) =>
                      typeof v === "number"
                        ? v.toLocaleString("fr-FR", {
                            maximumFractionDigits: 1,
                          })
                        : String(v)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value, _name, props) => {
                      const payload = props?.payload as
                        | { cells?: number }
                        | undefined;
                      const cells = payload?.cells;
                      const ha =
                        typeof value === "number"
                          ? value
                          : Number.parseFloat(String(value));
                      const haOk = Number.isFinite(ha) ? ha : 0;
                      return [
                        haOk.toLocaleString("fr-FR", {
                          maximumFractionDigits: 2,
                        }) +
                          " ha" +
                          (cells != null
                            ? " (" +
                              String(cells) +
                              " maille" +
                              (cells > 1 ? "s" : "") +
                              ")"
                            : ""),
                        "Surface",
                      ];
                    }}
                  />
                  <Bar
                    dataKey="surfaceHa"
                    fill={BAR_CATEGORY_FILL}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
    </div>
  );
}
