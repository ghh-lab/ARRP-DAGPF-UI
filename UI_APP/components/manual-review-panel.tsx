"use client";

import type { Feature } from "geojson";

export type ManualReviewEntry = {
  dagFeatureId: string;
  pendingCells: number;
  checkedCells: number;
  latestUpdateAt: string | null;
  commune: string;
  lot: string;
  feature: Feature | null;
};

interface ManualReviewPanelProps {
  loading: boolean;
  error: string | null;
  pendingParcels: number;
  rows: ManualReviewEntry[];
  onRefresh: () => void;
  onOpenParcel: (f: Feature) => void;
}

export function ManualReviewPanel({
  loading,
  error,
  pendingParcels,
  rows,
  onRefresh,
  onOpenParcel,
}: ManualReviewPanelProps) {
  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-emerald-50 text-emerald-950">
      <div className="border-b border-emerald-900/15 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Validation etiqueteurs</h2>
          <button
            type="button"
            className="rounded border border-emerald-800/25 bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-emerald-100 disabled:opacity-60"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Actualisation..." : "Actualiser"}
          </button>
        </div>
        <p className="mt-1 text-xs text-emerald-800/85">
          Valide les annotations manuelles faites par les etiqueteurs. Seules les
          lignes avec <span className="font-mono">check=true</span> sont prises en
          compte.
        </p>
        <p className="mt-1 text-xs">
          Parcelles en attente de validation : <strong>{pendingParcels}</strong>
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {error ? <p className="px-1 text-xs text-red-700">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <p className="px-1 text-xs text-emerald-800">
            Aucune parcelle en attente.
          </p>
        ) : null}
        <ul className="space-y-1">
          {rows.map((r) => {
            const canOpen = r.feature != null;
            const name = r.commune || r.lot || r.dagFeatureId;
            return (
              <li
                key={r.dagFeatureId}
                className="rounded border border-emerald-900/10 bg-white p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className={`text-left ${
                      canOpen ? "hover:underline" : "cursor-default opacity-70"
                    }`}
                    onClick={() => {
                      if (!r.feature) return;
                      onOpenParcel(r.feature);
                    }}
                    disabled={!canOpen}
                  >
                    <p className="text-xs font-semibold text-emerald-900">{name}</p>
                    <p className="text-[11px] text-emerald-800/85">
                      {r.lot ? `Lot ${r.lot} - ` : ""}
                      {r.dagFeatureId}
                    </p>
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-emerald-800/90">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5">
                    En attente: {r.pendingCells}
                  </span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5">
                    Deja valides: {r.checkedCells}
                  </span>
                  {r.latestUpdateAt ? (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                      Maj: {new Date(r.latestUpdateAt).toLocaleString("fr-FR")}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
