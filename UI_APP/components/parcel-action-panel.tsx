"use client";

import type { Feature } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { useParcelApp } from "@/context/parcel-app-context";
import { bboxFromFeature } from "@/lib/bbox";
import {
  bitsPerPixelFromStacFeature,
  buildRasterTilesUrl,
  cogHrefFromStacFeature,
  getStacApiBase,
  parseStacDatetime,
  type StacTileStyle,
} from "@/lib/stac";

type StacSearchFeature = {
  id: string;
  properties?: { datetime?: string };
  assets?: { mul?: { href?: string } };
};

type SelectedStacScene = {
  itemId: string;
  datetime: string | null;
  href: string;
  bitsPerPixel?: number;
};

interface ParcelActionPanelProps {
  feature: Feature;
  onClose: () => void;
  onSetCheck: (dagFeatureId: string, check: boolean) => Promise<boolean> | boolean;
  onNextParcel: () => void;
  onPrevParcel: () => void;
}

function dagFeatureIdFromFeature(feature: Feature): string {
  const p = feature.properties as Record<string, unknown> | null | undefined;
  const id1 = typeof p?._id === "string" ? p._id.trim() : "";
  if (id1) return id1;
  const id2 =
    typeof p?.dag_feature_id === "string" ? p.dag_feature_id.trim() : "";
  return id2;
}

export function ParcelActionPanel({
  feature,
  onClose,
  onSetCheck,
  onNextParcel,
  onPrevParcel,
}: ParcelActionPanelProps) {
  const {
    setManualEditPanelOpen,
    setStacAnnotationDatetime,
    setStacAnnotationItemId,
    setStacOverlay,
    vectorLayersOpacity,
    setVectorLayersOpacity,
  } = useParcelApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stacStyle, setStacStyle] = useState<StacTileStyle>("natural");
  const [selectedScene, setSelectedScene] = useState<SelectedStacScene | null>(null);

  const dagFeatureId = useMemo(() => dagFeatureIdFromFeature(feature), [feature]);
  const stacApiBase = useMemo(() => getStacApiBase(), []);

  const applyOverlayFromScene = (
    scene: SelectedStacScene,
    style: StacTileStyle
  ) => {
    setStacOverlay({
      tilesUrl: buildRasterTilesUrl(
        stacApiBase,
        scene.href,
        style,
        scene.bitsPerPixel
      ),
      itemId: scene.itemId,
      style,
    });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const box = bboxFromFeature(feature);
      if (!box) {
        setStacOverlay(null);
        return;
      }
      try {
        const qs = new URLSearchParams();
        qs.set("bbox", box.join(","));
        qs.set("limit", "40");
        const res = await fetch(`/api/stac/search?${qs.toString()}`);
        if (!res.ok) {
          if (!cancelled) setStacOverlay(null);
          return;
        }
        const j = (await res.json()) as { features?: StacSearchFeature[] };
        const feats = (j.features ?? []).filter((f) => !!cogHrefFromStacFeature(f));
        if (feats.length === 0) {
          if (!cancelled) setStacOverlay(null);
          return;
        }
        const sorted = [...feats].sort(
          (a, b) =>
            parseStacDatetime(b.properties?.datetime) -
            parseStacDatetime(a.properties?.datetime)
        );
        const pick = sorted[0]!;
        const href = cogHrefFromStacFeature(pick);
        if (!href) {
          if (!cancelled) setStacOverlay(null);
          return;
        }
        const bpp = bitsPerPixelFromStacFeature(pick);
        const dt = pick.properties?.datetime;
        const scene: SelectedStacScene = {
          itemId: pick.id,
          datetime: typeof dt === "string" && dt.trim() ? dt.trim() : null,
          href,
          bitsPerPixel: bpp,
        };
        if (!cancelled) {
          setStacAnnotationDatetime(scene.datetime);
          setStacAnnotationItemId(scene.itemId);
          setSelectedScene(scene);
          applyOverlayFromScene(scene, stacStyle);
        }
      } catch {
        if (!cancelled) setStacOverlay(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    feature,
    setStacAnnotationDatetime,
    setStacAnnotationItemId,
    setStacOverlay,
    stacStyle,
    stacApiBase,
  ]);

  useEffect(() => {
    if (!selectedScene) return;
    applyOverlayFromScene(selectedScene, stacStyle);
  }, [selectedScene, stacStyle]);

  const ensureStacSelection = async (): Promise<boolean> => {
    const box = bboxFromFeature(feature);
    if (!box) {
      setError("Geometrie parcelle non supportee.");
      return false;
    }
    try {
      const qs = new URLSearchParams();
      qs.set("bbox", box.join(","));
      qs.set("limit", "40");
      const res = await fetch(`/api/stac/search?${qs.toString()}`);
      if (!res.ok) {
        setError("STAC indisponible (HTTP " + String(res.status) + ").");
        return false;
      }
      const j = (await res.json()) as { features?: StacSearchFeature[] };
      const feats = (j.features ?? []).filter((f) => !!cogHrefFromStacFeature(f));
      if (feats.length === 0) {
        setError("Aucune scene STAC disponible pour cette parcelle.");
        return false;
      }
      const sorted = [...feats].sort(
        (a, b) =>
          parseStacDatetime(b.properties?.datetime) -
          parseStacDatetime(a.properties?.datetime)
      );
      const pick = sorted[0]!;
      const dt = pick.properties?.datetime;
      setStacAnnotationDatetime(typeof dt === "string" && dt.trim() ? dt.trim() : null);
      setStacAnnotationItemId(
        typeof pick.id === "string" && pick.id.trim() ? pick.id.trim() : null
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur STAC");
      return false;
    }
  };

  const runSetCheck = async (check: boolean) => {
    if (!dagFeatureId) {
      setError("Identifiant parcelle introuvable.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await onSetCheck(dagFeatureId, check);
      if (ok) onNextParcel();
    } finally {
      setBusy(false);
    }
  };

  const handleManualAnnotate = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await ensureStacSelection();
      if (!ok) return;
      setManualEditPanelOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-white text-emerald-950">
      <div className="flex items-start justify-between gap-2 border-b border-emerald-900/15 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">Actions parcelle</h2>
          <p className="mt-0.5 truncate text-xs text-emerald-800/90" title={dagFeatureId}>
            {dagFeatureId || "ID parcelle indisponible"}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-emerald-800/20 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          onClick={onClose}
          aria-label="Fermer"
        >
          Fermer
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-3">
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-3 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50"
          onClick={() => void runSetCheck(true)}
          disabled={busy}
        >
          Valider
        </button>
        <button
          type="button"
          className="rounded-md border border-amber-700/30 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50"
          onClick={() => void runSetCheck(false)}
          disabled={busy}
        >
          Refuser
        </button>
        <button
          type="button"
          className="rounded-md border border-emerald-800/30 bg-white px-3 py-2.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
          onClick={() => void handleManualAnnotate()}
          disabled={busy}
        >
          Modifier l&apos;annotation
        </button>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-md border border-emerald-800/25 bg-white px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
            onClick={onPrevParcel}
            disabled={busy}
          >
            ← Precedente
          </button>
          <button
            type="button"
            className="rounded-md border border-emerald-800/25 bg-white px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
            onClick={onNextParcel}
            disabled={busy}
          >
            Suivante →
          </button>
        </div>
        <div className="mt-2 rounded-md border border-emerald-900/10 bg-emerald-50/60 p-2">
          <p className="mb-1 text-[11px] font-medium text-emerald-900">
            Vue image satellite
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["natural", "Couleur"],
                ["ndvi", "NDVI"],
                ["urban", "Urban"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`rounded border px-2 py-1 text-xs font-medium ${
                  stacStyle === val
                    ? "border-emerald-700 bg-emerald-200 text-emerald-950"
                    : "border-emerald-800/25 bg-white text-emerald-900 hover:bg-emerald-100/80"
                }`}
                onClick={() => setStacStyle(val)}
                disabled={selectedScene == null}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-emerald-900/10 bg-emerald-50/60 p-2">
          <label className="text-[11px] font-medium text-emerald-900">
            Opacite des calques (hors image)
            <input
              type="range"
              min={0.25}
              max={1}
              step={0.05}
              value={vectorLayersOpacity}
              onChange={(e) =>
                setVectorLayersOpacity(Number.parseFloat(e.target.value))
              }
              className="mt-1 w-full"
            />
          </label>
        </div>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}
