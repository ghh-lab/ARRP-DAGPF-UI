"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParcelApp } from "@/context/parcel-app-context";
import type { VegClassesFile } from "@/lib/veg-classes";
import {
  bboxAroundMailleCenter,
} from "@/lib/manual-maille-selection";
import { formatAcquisitionDateFr } from "@/lib/parcel-fiche-helpers";

export function ParcelManualEditPanel() {
  const {
    selectedParcel,
    stacAnnotationDatetime,
    stacAnnotationItemId,
    manualSelectedCells,
    setManualSelectedCells,
    setManualEditPanelOpen,
    loadClusterData,
    bumpParcelVegPieRevision,
    parcelMongoDetail,
  } = useParcelApp();

  const [vegFile, setVegFile] = useState<VegClassesFile | null>(null);
  const [vegLoadError, setVegLoadError] = useState<string | null>(null);
  const [pickedVeg, setPickedVeg] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/veg-classes");
        if (!res.ok) {
          if (!cancelled)
            setVegLoadError("Classes HTTP " + String(res.status));
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

  const sortedClasses = useMemo(() => {
    const list = vegFile?.classes ?? [];
    return [...list].sort((a, b) => a.code - b.code);
  }, [vegFile]);

  const dateLine = useMemo(() => {
    if (!stacAnnotationDatetime) return null;
    return formatAcquisitionDateFr(stacAnnotationDatetime);
  }, [stacAnnotationDatetime]);

  const maillesReady =
    parcelMongoDetail != null && parcelMongoDetail.overlay.features.length > 0;

  const handleApply = useCallback(async () => {
    if (!selectedParcel?.geometry) {
      setSaveError("Aucune parcelle selectionnee.");
      return;
    }
    if (!stacAnnotationDatetime) {
      setSaveError("Choisis une image STAC (date) dans la fiche parcelle.");
      return;
    }
    if (!maillesReady) {
      setSaveError(
        "Les mailles IA (Mongo) ne sont pas chargees : ouvre la fiche parcelle et attends le camembert IA."
      );
      return;
    }
    if (manualSelectedCells.length === 0) {
      setSaveError(
        "Selectionne au moins une maille sur la carte (clic ou Maj + rectangle)."
      );
      return;
    }
    const vegCat = Number(pickedVeg);
    if (!Number.isFinite(vegCat)) {
      setSaveError("Choisis un type de culture.");
      return;
    }
    const bboxes = manualSelectedCells.map(({ lon, lat }) =>
      bboxAroundMailleCenter(lon, lat)
    );
    const props = selectedParcel.properties as Record<string, unknown> | undefined;
    let dagFeatureId = "";
    if (props) {
      const pid = props._id;
      if (typeof pid === "string" && pid.trim() !== "") {
        dagFeatureId = pid.trim();
      } else if (
        typeof props.dag_feature_id === "string" &&
        props.dag_feature_id.trim() !== ""
      ) {
        dagFeatureId = props.dag_feature_id.trim();
      }
    }
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const res = await fetch("/api/parcel-manual-veg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geometry: selectedParcel.geometry,
          dagFeatureId,
          datetime: stacAnnotationDatetime,
          stacItemId: stacAnnotationItemId,
          bboxes,
          vegCat,
        }),
      });
      const j = (await res.json()) as { error?: string; updated?: number };
      if (!res.ok) {
        setSaveError(j.error ?? "Erreur enregistrement");
        return;
      }
      const n = typeof j.updated === "number" ? j.updated : 0;
      setSaveOk(
        n === 0
          ? "Aucune maille mise a jour (alignez semestre STAC / parcelle / centre maille)."
          : String(n) + " maille(s) mise(s) a jour (veg_cat + veg_cat_manual=true)."
      );
      setManualSelectedCells([]);
      bumpParcelVegPieRevision();
      await loadClusterData({ force: true });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur reseau");
    } finally {
      setSaving(false);
    }
  }, [
    selectedParcel,
    stacAnnotationDatetime,
    stacAnnotationItemId,
    maillesReady,
    manualSelectedCells,
    pickedVeg,
    setManualSelectedCells,
    loadClusterData,
    bumpParcelVegPieRevision,
  ]);

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-emerald-50 text-emerald-950">
      <div className="border-b border-emerald-900/15 px-3 py-2.5">
        <h2 className="text-sm font-semibold leading-tight">
          Modifier les cultures (manuel)
        </h2>
        <p className="mt-1 text-[11px] leading-snug text-emerald-800/85">
          Clic sur une maille pour basculer ; maintiens Maj et trace un rectangle
          pour ajouter toutes les mailles dont le centre est dans la zone ; les
          ajouts se cumulent avec les clics unitaires. Applique une classe veg_cat aux points
          CSV dans ces mailles (meme semestre que la date STAC). Colonne{" "}
          <span className="font-mono text-[10px]">veg_cat_manual</span> = true :
          les clusters n&apos;ecrasent plus ces points.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {!selectedParcel ? (
          <p className="text-emerald-800">
            Selectionne d&apos;abord une parcelle sur la carte.
          </p>
        ) : (
          <>
            <p className="text-xs text-emerald-800">
              Parcelle active. Periode d&apos;annotation :{" "}
              {dateLine ? (
                <strong>{dateLine}</strong>
              ) : (
                <span className="text-amber-800">
                  non definie — ouvre la fiche parcelle et choisis une scene STAC.
                </span>
              )}
            </p>

            {!maillesReady ? (
              <p className="mt-2 text-xs text-amber-800">
                Les mailles IA ne sont pas encore affichees : garde la fiche
                parcelle ouverte jusqu&apos;au chargement du bloc &quot;Type de
                culture (IA MongoDB)&quot;.
              </p>
            ) : null}

            {vegLoadError ? (
              <p className="mt-2 text-xs text-red-700">{vegLoadError}</p>
            ) : (
              <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-emerald-900">
                Type de culture (veg_cat)
                <select
                  className="rounded border border-emerald-800/25 bg-white px-2 py-2 text-sm text-emerald-950"
                  value={pickedVeg}
                  onChange={(e) => setPickedVeg(e.target.value)}
                  data-tour="manual-edit-select-veg"
                >
                  <option value="">--</option>
                  {sortedClasses.map((c) => (
                    <option key={c.code} value={String(c.code)}>
                      {c.nom} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <p className="mt-3 text-xs text-emerald-800">
              Mailles selectionnees :{" "}
              {manualSelectedCells.length === 0 ? (
                "aucune — clic maille ou Maj + rectangle sur la parcelle."
              ) : (
                <span className="font-mono text-[10px]">
                  {String(manualSelectedCells.length)} carre(s)
                </span>
              )}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={
                  saving ||
                  manualSelectedCells.length === 0 ||
                  !maillesReady
                }
                className="rounded-md border border-emerald-800/30 bg-white px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100/80 disabled:opacity-50"
                onClick={() => setManualSelectedCells([])}
              >
                Effacer la selection
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  manualSelectedCells.length === 0 ||
                  !maillesReady
                }
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                onClick={() => void handleApply()}
                data-tour="manual-edit-apply"
              >
                {saving ? "Enregistrement..." : "Appliquer sur les mailles"}
              </button>
            </div>

            {saveError ? (
              <p className="mt-2 text-xs text-red-700">{saveError}</p>
            ) : null}
            {saveOk ? (
              <p className="mt-2 text-xs text-emerald-800">{saveOk}</p>
            ) : null}
          </>
        )}
      </div>
      <div className="border-t border-emerald-900/15 p-3">
        <button
          type="button"
          className="w-full rounded-md border border-emerald-800/30 bg-white px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
          onClick={() => setManualEditPanelOpen(false)}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
