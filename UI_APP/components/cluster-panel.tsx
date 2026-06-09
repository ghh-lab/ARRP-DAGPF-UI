"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParcelApp } from "@/context/parcel-app-context";
import { CLUSTER_CELL_AREA_SQM } from "@/lib/cluster-types";
import type { VegClassesFile } from "@/lib/veg-classes";

export function ClusterPanel() {
  const {
    clusterRanking,
    clusterGeojson,
    clusterDataLoading,
    clusterDataError,
    loadClusterData,
    selectedClusterId,
    setSelectedClusterId,
    clusterLabels,
    refreshClusterLabels,
  } = useParcelApp();

  const [vegFile, setVegFile] = useState<VegClassesFile | null>(null);
  const [vegLoadError, setVegLoadError] = useState<string | null>(null);
  const [pickedVeg, setPickedVeg] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [clusterListQuery, setClusterListQuery] = useState("");

  useEffect(() => {
    void loadClusterData();
  }, [loadClusterData]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/veg-classes");
        if (!res.ok) {
          if (!cancelled)
            setVegLoadError("Classes vegetation HTTP " + res.status);
          return;
        }
        const j = (await res.json()) as VegClassesFile;
        if (!cancelled) {
          setVegFile(j);
          setVegLoadError(null);
        }
      } catch (e) {
        if (!cancelled)
          setVegLoadError(
            e instanceof Error ? e.message : "Erreur classes vegetation"
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedClusterId === null) return;
    const existing = clusterLabels[selectedClusterId];
    setPickedVeg(existing ? String(existing.vegCat) : "");
    setCustomLabel(existing?.displayName ?? "");
    setSaveError(null);
  }, [selectedClusterId, clusterLabels]);

  const displayRanking = useMemo(() => {
    const base = clusterRanking ?? [];
    const isLabeled = (id: number) => clusterLabels[id] !== undefined;
    return [...base].sort((a, b) => {
      const la = isLabeled(a.clusterId);
      const lb = isLabeled(b.clusterId);
      if (la !== lb) return la ? 1 : -1;
      if (b.count !== a.count) return b.count - a.count;
      return a.clusterId - b.clusterId;
    });
  }, [clusterRanking, clusterLabels]);

  const filteredRanking = useMemo(() => {
    const q = clusterListQuery.trim().toLowerCase();
    if (q === "") return displayRanking;
    return displayRanking.filter((row) => {
      const label = clusterLabels[row.clusterId];
      const name = (label?.displayName ?? "").toLowerCase();
      const idStr = String(row.clusterId);
      const countStr = String(row.count);
      return (
        idStr.includes(q) ||
        countStr.includes(q) ||
        name.includes(q) ||
        ("cluster " + idStr).includes(q)
      );
    });
  }, [displayRanking, clusterListQuery, clusterLabels]);

  const sortedClasses = useMemo(() => {
    const list = vegFile?.classes ?? [];
    return [...list].sort((a, b) => a.code - b.code);
  }, [vegFile]);

  const selectedClusterVectorCount = useMemo(() => {
    if (!clusterGeojson || selectedClusterId === null) return 0;
    return clusterGeojson.features.filter(
      (f) =>
        (f.properties as { cluster_id?: number }).cluster_id ===
        selectedClusterId
    ).length;
  }, [clusterGeojson, selectedClusterId]);

  const handleResetAllLabels = useCallback(async () => {
    const ok = window.confirm(
      "Effacer les etiquettes de clusters (JSON) et vider veg_cat pour les mailles non annotees a la main ? Les lignes avec veg_cat_manual=true conservent veg_cat et ne sont pas modifiees par les clusters."
    );
    if (!ok) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch("/api/cluster-label", { method: "DELETE" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setResetError(j.error ?? "Erreur reinitialisation");
        return;
      }
      setSelectedClusterId(null);
      setPickedVeg("");
      setCustomLabel("");
      await refreshClusterLabels();
      await loadClusterData({ force: true });
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Erreur reseau");
    } finally {
      setResetting(false);
    }
  }, [refreshClusterLabels, setSelectedClusterId, loadClusterData]);

  const handleValidate = useCallback(async () => {
    if (selectedClusterId === null) return;
    const vegCat = Number(pickedVeg);
    if (!Number.isFinite(vegCat)) {
      setSaveError("Choisis une categorie.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body: {
        clusterId: number;
        vegCat: number;
        displayName?: string;
      } = { clusterId: selectedClusterId, vegCat };
      const trimmed = customLabel.trim();
      if (trimmed !== "") body.displayName = trimmed;
      const res = await fetch("/api/cluster-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSaveError(j.error ?? "Erreur enregistrement");
        return;
      }
      await refreshClusterLabels();
      await loadClusterData({ force: true });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur reseau");
    } finally {
      setSaving(false);
    }
  }, [
    selectedClusterId,
    pickedVeg,
    customLabel,
    refreshClusterLabels,
    loadClusterData,
  ]);

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-emerald-50 text-emerald-950">
      <div className="border-b border-emerald-900/15 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">Clusters (classification)</h2>
          <button
            type="button"
            className="shrink-0 rounded border border-red-700/40 bg-white px-2 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
            onClick={() => void handleResetAllLabels()}
            disabled={resetting || clusterDataLoading}
          >
            {resetting ? "Reinitialisation..." : "Tout reinitialiser"}
          </button>
        </div>
        <label className="sr-only" htmlFor="cluster-list-search">
          Rechercher dans la liste des clusters
        </label>
        <input
          id="cluster-list-search"
          type="search"
          autoComplete="off"
          placeholder="Rechercher (id, libelle, nombre de vecteurs...)"
          value={clusterListQuery}
          onChange={(e) => setClusterListQuery(e.target.value)}
          className="mt-2 w-full rounded border border-emerald-800/25 bg-white px-2 py-1.5 text-xs text-emerald-950 placeholder:text-emerald-800/55"
        />
        <p className="mt-2 text-[10px] leading-snug text-emerald-800/85">
          Mailles avec{" "}
          <span className="font-mono">veg_cat_manual=true</span> (annotation
          depuis la fiche parcelle)
          : retirees du calque clusters et jamais ecrasees par Valider ci-dessous.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {clusterDataLoading ? (
          <p className="px-1 text-xs text-emerald-800">Chargement des clusters...</p>
        ) : null}
        {clusterDataError ? (
          <p className="px-1 text-xs text-red-700">{clusterDataError}</p>
        ) : null}
        {vegLoadError ? (
          <p className="px-1 text-xs text-amber-800">{vegLoadError}</p>
        ) : null}
        {saveError ? (
          <p className="px-1 text-xs text-red-700">{saveError}</p>
        ) : null}
        {resetError ? (
          <p className="px-1 text-xs text-red-700">{resetError}</p>
        ) : null}
        {!clusterDataLoading && !clusterDataError && displayRanking.length === 0 ? (
          <p className="px-1 text-xs text-emerald-800">Aucun classement charge.</p>
        ) : null}
        {clusterGeojson && selectedClusterId !== null ? (
          <div className="mb-2 flex flex-col gap-2 border-b border-emerald-900/10 pb-2">
            <span className="text-xs text-emerald-800">
              Selection : cluster {selectedClusterId} —{" "}
              {selectedClusterVectorCount} vecteurs, surface indicative ~{" "}
              {(
                selectedClusterVectorCount * CLUSTER_CELL_AREA_SQM
              ).toLocaleString("fr-FR")}{" "}
              m², soit{" "}
              {(
                (selectedClusterVectorCount * CLUSTER_CELL_AREA_SQM) /
                10000
              ).toFixed(2)}{" "}
              ha
            </span>
            {vegFile && (
              <div className="rounded border border-emerald-800/20 bg-white/90 p-2">
                <p className="mb-1 text-[11px] font-medium text-emerald-900">
                  Etiquette vegetation (CSV : colonne veg_cat)
                </p>
                <label className="mb-1 block text-[10px] text-emerald-800">
                  Categorie
                </label>
                <select
                  className="mb-2 w-full rounded border border-emerald-800/30 bg-white px-2 py-1 text-xs text-emerald-950"
                  value={pickedVeg}
                  onChange={(e) => setPickedVeg(e.target.value)}
                >
                  <option value="">Choisir...</option>
                  {sortedClasses.map((c) => (
                    <option key={c.code} value={String(c.code)}>
                      {c.code} — {c.nom}
                    </option>
                  ))}
                </select>
                <label className="mb-1 block text-[10px] text-emerald-800">
                  Libelle affiche (optionnel ; par defaut : nom de la classe)
                </label>
                <input
                  type="text"
                  className="mb-2 w-full rounded border border-emerald-800/30 bg-white px-2 py-1 text-xs text-emerald-950"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Ex. Bananier commun"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-emerald-700 bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    onClick={() => void handleValidate()}
                    disabled={saving || pickedVeg === ""}
                  >
                    {saving ? "Enregistrement..." : "Valider"}
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              className="self-start rounded border border-emerald-800/30 bg-white px-2 py-0.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
              onClick={() => setSelectedClusterId(null)}
            >
              Effacer surbrillance
            </button>
          </div>
        ) : null}
        {!clusterDataLoading &&
        !clusterDataError &&
        displayRanking.length > 0 &&
        filteredRanking.length === 0 ? (
          <p className="mb-2 px-1 text-xs text-emerald-800">
            Aucun cluster ne correspond a la recherche.
          </p>
        ) : null}
        <ul className="space-y-0.5">
          {filteredRanking.map((row) => {
            const active = selectedClusterId === row.clusterId;
            const label = clusterLabels[row.clusterId];
            const labeled = label !== undefined;
            const rowCls = labeled
              ? active
                ? "bg-slate-300 ring-1 ring-red-400"
                : "bg-slate-200 text-slate-800 ring-1 ring-slate-400/40"
              : active
                ? "bg-red-100 ring-1 ring-red-400"
                : "bg-white hover:bg-emerald-100/80";
            return (
              <li key={row.clusterId} className="rounded">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${rowCls}`}
                  onClick={() => setSelectedClusterId(row.clusterId)}
                >
                  <span className="font-medium">
                    {labeled ? (
                      <>
                        Cluster {row.clusterId} — {label.displayName}
                      </>
                    ) : (
                      <>Cluster {row.clusterId}</>
                    )}
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      labeled ? "text-slate-600" : "text-emerald-800"
                    }`}
                  >
                    {row.count} vecteurs
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
