"use client";

import { useEffect, useMemo, useState } from "react";
import { useParcelApp } from "@/context/parcel-app-context";
import { fieldHasNone } from "@/lib/parcel-filters";
import type { VegClassesFile } from "@/lib/veg-classes";

function SelectRow({
  label,
  value,
  onChange,
  options,
  includeNoneOption,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  includeNoneOption: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-emerald-950">{label}</span>
      <select
        className="rounded-md border border-emerald-800/20 bg-white px-2 py-1.5 text-emerald-950 shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Toutes / tous</option>
        {includeNoneOption ? (
          <option value="__none__">Non renseigne</option>
        ) : null}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DataPanel() {
  const {
    data,
    filters,
    setFilters,
    resetFilters,
    filteredFeatureCount,
    communes,
    productionTypes,
    surfaceBounds,
  } = useParcelApp();
  const [vegFile, setVegFile] = useState<VegClassesFile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/veg-classes");
        if (!res.ok) return;
        const j = (await res.json()) as VegClassesFile;
        if (!cancelled) setVegFile(j);
      } catch {
        /* ignore and keep fallback options */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const productionTypeOptions = useMemo(() => {
    const classes = vegFile?.classes ?? [];
    if (classes.length === 0) return productionTypes;
    const byCode = [...classes].sort((a, b) => a.code - b.code);
    const names: string[] = [];
    const seen = new Set<string>();
    for (const c of byCode) {
      const n = c.nom.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      names.push(n);
    }
    for (const n of productionTypes) {
      if (!n || seen.has(n)) continue;
      seen.add(n);
      names.push(n);
    }
    return names;
  }, [vegFile, productionTypes]);

  if (!data) return null;

  const noneCommune = fieldHasNone(data.features, "commune");
  const noneProd = fieldHasNone(data.features, "production_type");

  return (
    <div className="flex h-full flex-col gap-4 p-4 text-emerald-950">
      <div>
        <h2 className="text-lg font-semibold">Recherche et filtres</h2>
        <p className="mt-1 text-xs text-emerald-800/80">
          Filtrez les parcelles par commune, type de culture et surface (ha).
        </p>
      </div>

      <SelectRow
        label="Commune"
        value={filters.commune}
        onChange={(commune) => setFilters((prev) => ({ ...prev, commune }))}
        options={communes}
        includeNoneOption={noneCommune}
      />

      <SelectRow
        label="Type de production"
        value={filters.productionType}
        onChange={(productionType) =>
          setFilters((prev) => ({ ...prev, productionType }))
        }
        options={productionTypeOptions}
        includeNoneOption={noneProd}
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Surface (ha) : {filters.surfaceMin.toFixed(3)} —{" "}
          {filters.surfaceMax.toFixed(3)}
        </span>
        <label className="flex flex-col gap-1 text-xs text-emerald-800">
          Minimum (ha)
          <input
            type="number"
            min={surfaceBounds.min}
            max={surfaceBounds.max}
            step={0.001}
            className="rounded-md border border-emerald-800/20 px-2 py-1"
            value={filters.surfaceMin}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isNaN(v)) return;
              setFilters((prev) => ({
                ...prev,
                surfaceMin: Math.min(v, prev.surfaceMax),
              }));
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-emerald-800">
          Maximum (ha)
          <input
            type="number"
            min={surfaceBounds.min}
            max={surfaceBounds.max}
            step={0.001}
            className="rounded-md border border-emerald-800/20 px-2 py-1"
            value={filters.surfaceMax}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isNaN(v)) return;
              setFilters((prev) => ({
                ...prev,
                surfaceMax: Math.max(v, prev.surfaceMin),
              }));
            }}
          />
        </label>
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-emerald-900/10 pt-3">
        <p className="text-sm">
          Parcelles affichees :{" "}
          <strong>{filteredFeatureCount}</strong> / {data.features.length}
        </p>
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
          onClick={resetFilters}
        >
          Reinitialiser les filtres
        </button>
      </div>
    </div>
  );
}
