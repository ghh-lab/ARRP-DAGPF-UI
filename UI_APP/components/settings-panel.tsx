"use client";

import { useEffect, useState } from "react";

type ReportRow = {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
};

type ModelInsightsResponse = {
  model?: {
    available?: boolean;
    sourceRunText?: string;
    runMeta?: Record<string, unknown> | null;
    metrics?: Record<string, unknown> | null;
    runsHistory?: {
      run_id?: number;
      folder?: string;
      macro_f1?: number;
      accuracy?: number;
      model?: string;
    }[];
    reportText?: string;
    reportRows?: ReportRow[];
  };
  classes?: {
    available?: boolean;
    schemaVersion?: string | null;
    territoire?: string | null;
    description?: string | null;
    totalClasses?: number;
    groups?: {
      name: string;
      count: number;
      classes: {
        code?: number;
        nom?: string;
        groupe?: string;
        exemples_libelles?: string[];
      }[];
    }[];
  };
  error?: string;
};

function pct(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return (n * 100).toFixed(2) + " %";
}

function num(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return String(n);
}

function pctFromUnit(v: number): string {
  return (v * 100).toFixed(2) + "%";
}

export function SettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ModelInsightsResponse | null>(null);
  const [cmMissing, setCmMissing] = useState(false);
  const [evolutionMissing, setEvolutionMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/model-insights", { cache: "no-store" });
        const j = (await res.json()) as ModelInsightsResponse;
        if (!res.ok) {
          if (!cancelled) setError(j.error ?? "Erreur chargement insights");
          return;
        }
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur reseau");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const m = data?.model;
  const c = data?.classes;
  const metrics = m?.metrics ?? {};
  const runMeta = m?.runMeta ?? {};
  const reportRows = m?.reportRows ?? [];
  const runsHistory = [...(m?.runsHistory ?? [])]
    .filter((x) => Number.isFinite(Number(x.run_id)) && Number.isFinite(Number(x.accuracy)))
    .sort((a, b) => Number(a.run_id) - Number(b.run_id));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-emerald-50 text-emerald-900">
        Chargement des paramètres et des analyses...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-red-700">
        Impossible de charger les analyses du modèle : {error}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-emerald-50 p-4 text-emerald-950 sm:p-6">
      <section
        className="rounded-xl border border-emerald-900/15 bg-white p-4 shadow-sm"
        data-tour="settings-model-summary"
      >
        <h3 className="text-base font-semibold">Le modèle sélectionné</h3>
        <p className="mt-1 text-xs text-emerald-800/90">
          Vue rapide des performances de la meilleure version sauvegardée dans{" "}
          <span className="font-mono">Backend/5_final_model/output/best</span>.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-emerald-100/70 p-3">
            <p className="text-[11px] text-emerald-800">Exactitude</p>
            <p className="text-lg font-semibold">{pct(metrics.accuracy)}</p>
          </div>
          <div className="rounded-lg bg-emerald-100/70 p-3">
            <p className="text-[11px] text-emerald-800">Score F1 macro</p>
            <p className="text-lg font-semibold">{pct(metrics.macro_f1)}</p>
          </div>
          <div className="rounded-lg bg-emerald-100/70 p-3">
            <p className="text-[11px] text-emerald-800">Version</p>
            <p className="text-lg font-semibold">{num(runMeta.run_id)}</p>
          </div>
          <div className="rounded-lg bg-emerald-100/70 p-3">
            <p className="text-[11px] text-emerald-800">Points de grille</p>
            <p className="text-lg font-semibold">{num(runMeta.n_grid_points)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-emerald-800/90">
          Source de la version :{" "}
          <span className="font-mono">
            {m?.sourceRunText && m.sourceRunText !== ""
              ? m.sourceRunText
              : "non disponible"}
          </span>
        </p>
        <p className="mt-2 text-xs text-emerald-800/90" data-tour="settings-weekly-update">
          Mise a jour des insights : une fois par semaine, pendant le week-end.
        </p>
      </section>

      <section
        className="mt-4 rounded-xl border border-emerald-900/15 bg-white p-4 shadow-sm"
        data-tour="settings-accuracy-evolution"
      >
        <h3 className="text-base font-semibold">Évolution de l&apos;exactitude</h3>
        {evolutionMissing ? (
          <p className="mt-2 text-sm text-amber-800">
            Fichier introuvable. Relance l&apos;entraînement pour générer
            <span className="mx-1 font-mono">evolution_runs_accuracy.png</span>.
          </p>
        ) : (
          <img
            src={"/api/model-evolution-runs-accuracy?ts=" + String(Date.now())}
            alt="Évolution de l'exactitude sur les runs"
            className="mt-3 w-full rounded-lg border border-emerald-900/15 bg-white"
            onError={() => setEvolutionMissing(true)}
          />
        )}
        {runsHistory.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-800">
            Historique indisponible.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-emerald-900/15 text-left text-emerald-800">
                  <th className="px-2 py-1">Version</th>
                  <th className="px-2 py-1">Exactitude</th>
                  <th className="px-2 py-1">Score F1 macro</th>
                </tr>
              </thead>
              <tbody>
                {runsHistory.map((r) => (
                  <tr key={String(r.run_id)} className="border-b border-emerald-900/10">
                    <td className="px-2 py-1 font-mono">{String(r.run_id ?? "-")}</td>
                    <td className="px-2 py-1 font-mono">
                      {Number.isFinite(Number(r.accuracy))
                        ? pctFromUnit(Number(r.accuracy))
                        : "-"}
                    </td>
                    <td className="px-2 py-1 font-mono">
                      {Number.isFinite(Number(r.macro_f1))
                        ? pctFromUnit(Number(r.macro_f1))
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="mt-4 rounded-xl border border-emerald-900/15 bg-white p-4 shadow-sm"
        data-tour="settings-confusion-matrix"
      >
        <h3 className="text-base font-semibold">Matrice de confusion</h3>
        <p className="mt-1 text-xs text-emerald-800/90">
          Image de la dernière version si disponible dans les artefacts.
        </p>
        <details className="mt-3 rounded-lg border border-emerald-900/10 bg-emerald-50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-emerald-900">
            Comment lire la matrice de confusion
          </summary>
          <ul className="mt-2 space-y-1 text-emerald-900/90">
            <li>
              La diagonale represente les bonnes predictions (classe predite = classe reelle).
            </li>
            <li>
              Les cases hors diagonale montrent les confusions entre classes.
            </li>
            <li>
              Plus la diagonale est &quot;forte&quot;, meilleur est le modèle sur les classes concernées.
            </li>
            <li>
              Si deux classes se confondent souvent, il faut plus de données ou des caractéristiques plus discriminantes.
            </li>
          </ul>
        </details>
        {cmMissing ? (
          <p className="mt-2 text-sm text-amber-800">
            Fichier de matrice de confusion introuvable. Relance l&apos;entraînement pour générer
            <span className="mx-1 font-mono">confusion_matrix.png</span>.
          </p>
        ) : (
          <img
            src={"/api/model-confusion-matrix?ts=" + String(Date.now())}
            alt="Matrice de confusion du dernier modèle"
            className="mt-3 w-full rounded-lg border border-emerald-900/15 bg-white"
            onError={() => setCmMissing(true)}
          />
        )}
      </section>

      <section
        className="mt-4 rounded-xl border border-emerald-900/15 bg-white p-4 shadow-sm"
        data-tour="settings-classification-report"
      >
        <h3 className="text-base font-semibold">Rapport de classification complet</h3>
        <p className="mt-1 text-xs text-emerald-800/90">
          Liste complète par classe : précision, rappel, score F1 et effectif.
        </p>
        <details className="mt-3 rounded-lg border border-emerald-900/10 bg-emerald-50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-emerald-900">
            Définitions des métriques
          </summary>
          <ul className="mt-2 space-y-1 text-emerald-900/90">
            <li>
              <span className="font-semibold">Précision</span> : parmi les éléments prédits dans une classe,
              part qui est correcte. Haute précision = peu de faux positifs.
            </li>
            <li>
              <span className="font-semibold">Rappel</span> : parmi les éléments réels d&apos;une classe,
              part que le modèle retrouve. Haut rappel = peu de faux négatifs.
            </li>
            <li>
              <span className="font-semibold">Score F1</span> : moyenne harmonique précision/rappel.
              Utile pour équilibrer les deux quand il existe un compromis.
            </li>
            <li>
              <span className="font-semibold">Effectif</span> : nombre d exemples réels de la classe
              dans le jeu d&apos;évaluation.
            </li>
          </ul>
        </details>
        <div className="mt-3 overflow-x-auto">
          {reportRows.length === 0 ? (
            <p className="text-sm text-emerald-800">Aucune donnée disponible.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-emerald-900/15 text-left text-emerald-800">
                  <th className="px-2 py-1">Classe</th>
                  <th className="px-2 py-1">Précision</th>
                  <th className="px-2 py-1">Rappel</th>
                  <th className="px-2 py-1">Score F1</th>
                  <th className="px-2 py-1">Effectif</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((r) => (
                  <tr key={r.label} className="border-b border-emerald-900/10">
                    <td className="px-2 py-1">{r.label}</td>
                    <td className="px-2 py-1 font-mono">{pctFromUnit(r.precision)}</td>
                    <td className="px-2 py-1 font-mono">{pctFromUnit(r.recall)}</td>
                    <td className="px-2 py-1 font-mono">{pctFromUnit(r.f1)}</td>
                    <td className="px-2 py-1 font-mono">{String(r.support)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section
        className="mt-4 rounded-xl border border-emerald-900/15 bg-white p-4 shadow-sm"
        data-tour="settings-classes-reference"
      >
        <h3 className="text-base font-semibold">Référentiel des classes plantations</h3>
        <p className="mt-1 text-xs text-emerald-800/90">
          Description complète de{" "}
          <span className="font-mono">Public_Data/classes_plantations_polynesie.json</span>
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="font-semibold">Territoire:</span>{" "}
            {c?.territoire ?? "-"}
          </p>
          <p>
            <span className="font-semibold">Version du schéma :</span>{" "}
            {c?.schemaVersion ?? "-"}
          </p>
          <p className="sm:col-span-2">
            <span className="font-semibold">Description :</span>{" "}
            {c?.description ?? "-"}
          </p>
          <p>
            <span className="font-semibold">Nombre total de classes :</span>{" "}
            {num(c?.totalClasses)}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {(c?.groups ?? []).map((g) => (
            <details
              key={g.name}
              className="rounded-lg border border-emerald-900/10 bg-emerald-50 px-3 py-2"
            >
              <summary className="cursor-pointer text-sm font-semibold">
                {g.name} ({g.count})
              </summary>
              <div className="mt-2 space-y-2">
                {g.classes.map((cl) => (
                  <div
                    key={String(cl.code) + "-" + String(cl.nom)}
                    className="rounded-md border border-emerald-900/10 bg-white px-3 py-2"
                  >
                    <p className="text-sm font-medium">
                      {String(cl.code)} - {cl.nom}
                    </p>
                    <p className="mt-1 text-xs text-emerald-800/90">
                      Exemples :{" "}
                      {(cl.exemples_libelles ?? []).length > 0
                        ? (cl.exemples_libelles ?? []).join(", ")
                        : "Aucun exemple"}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
