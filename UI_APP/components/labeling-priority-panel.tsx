"use client";

import type { Feature } from "geojson";

export type LabelingPriorityEntry = {
  dagFeatureId: string;
  vectors: number;
  commune: string;
  lot: string;
  feature: Feature | null;
};

interface LabelingPriorityPanelProps {
  loading: boolean;
  error: string | null;
  totalParcels: number;
  top10: LabelingPriorityEntry[];
  onRefresh: () => void;
  onOpenParcel: (f: Feature) => void;
}

export function LabelingPriorityPanel({
  loading,
  error,
  totalParcels,
  top10,
  onRefresh,
  onOpenParcel,
}: LabelingPriorityPanelProps) {
  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-emerald-50 text-emerald-950">
      <div className="border-b border-emerald-900/15 px-3 py-2.5" data-tour="labeling-summary">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Priorites etiquetage</h2>
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
          Parcelles avec points IA encore en classe <strong>A labelliser</strong>.
        </p>
        <p className="mt-1 text-xs">
          Total parcelles a traiter : <strong>{totalParcels}</strong>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {error ? <p className="px-1 text-xs text-red-700">{error}</p> : null}
        {!loading && !error && top10.length === 0 ? (
          <p className="px-1 text-xs text-emerald-800">
            Aucune parcelle a labelliser detectee.
          </p>
        ) : null}

        <ul className="space-y-1">
          {top10.map((row, idx) => {
            const canOpen = row.feature != null;
            const name = row.commune || row.lot || row.dagFeatureId;
            return (
              <li
                key={row.dagFeatureId}
                className="rounded"
                data-tour={idx === 0 ? "labeling-top-item-1" : undefined}
              >
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                    canOpen
                      ? "bg-white hover:bg-emerald-100/80"
                      : "bg-slate-100 text-slate-500"
                  }`}
                  onClick={() => {
                    if (!row.feature) return;
                    onOpenParcel(row.feature);
                  }}
                  disabled={!canOpen}
                >
                  <span className="min-w-0">
                    <span className="font-semibold text-emerald-900">
                      #{idx + 1} {name}
                    </span>
                    <span className="block truncate text-[11px] text-emerald-800/80">
                      {row.lot ? `Lot ${row.lot} - ` : ""}
                      {row.dagFeatureId}
                    </span>
                  </span>
                  <span className="ml-2 shrink-0 rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                    {row.vectors} vecteurs
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
