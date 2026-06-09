"use client";

import type { Feature } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { useParcelApp } from "@/context/parcel-app-context";
import { clusterImageryHintsFromGeojson } from "@/lib/cluster-imagery";
import { bboxFromFeature } from "@/lib/bbox";
import {
  formatPropertyValue,
  labelForPropertyKey,
} from "@/lib/parcel-detail-labels";
import {
  bitsPerPixelFromStacFeature,
  buildRasterTilesUrl,
  cogHrefFromStacFeature,
  getStacApiBase,
  parseStacDatetime,
  pickStacItemForCluster,
  type StacTileStyle,
} from "@/lib/stac";
import {
  VegCatPieChart,
  type VegCatPieSlice,
} from "@/components/veg-cat-pie-chart";
import { fillForVegCatCode } from "@/lib/veg-chart-colors";

interface ParcelDetailPanelProps {
  feature: Feature;
  onClose: () => void;
}

/** Keys excluded from the fiche parcelle property list (UI). */
const HIDDEN_FICHE_KEYS = new Set([
  "type_parcelle",
  "classification_status",
  "nature_sol",
  "etat_lot",
  "etat_cheptel",
  "observations",
  "parcel_id",
  "feature_index",
  "object_id",
  "global_id",
]);

function orderedPropertyEntries(
  properties: Record<string, unknown> | null
): [string, unknown][] {
  if (!properties) return [];
  const keys = Object.keys(properties).filter((k) => !HIDDEN_FICHE_KEYS.has(k));
  const priority = [
    "commune",
    "num_lot",
    "surface_ha",
    "surface_km2",
    "production_type",
    "_id",
  ];
  const first: [string, unknown][] = [];
  const seen = new Set<string>();
  for (const k of priority) {
    if (k in properties) {
      first.push([k, properties[k]]);
      seen.add(k);
    }
  }
  const rest = keys
    .filter((k) => !seen.has(k))
    .sort()
    .map((k) => [k, properties[k]] as [string, unknown]);
  return [...first, ...rest];
}

type StacSearchFeature = {
  id: string;
  properties?: { datetime?: string };
  assets?: { mul?: { href?: string } };
};

function pieSlicesFromMongo(
  entries: Array<{
    category_id: number;
    category_name: string;
    surfaceHa: number;
  }>
): VegCatPieSlice[] {
  return entries
    .map((e) => ({
      name: e.category_name,
      value: e.surfaceHa,
      tooltipHa: e.surfaceHa,
      vegCode: e.category_id,
    }))
    .sort((a, b) => b.value - a.value);
}

export function ParcelDetailPanel({ feature, onClose }: ParcelDetailPanelProps) {
  const {
    setStacOverlay,
    selectedClusterId,
    clusterGeojson,
    setStacAnnotationDatetime,
    setStacAnnotationItemId,
    setManualEditPanelOpen,
    parcelMongoDetail,
    parcelMongoLoading,
    parcelMongoError,
    vectorLayersOpacity,
    setVectorLayersOpacity,
  } = useParcelApp();
  const stacApiBase = useMemo(() => getStacApiBase(), []);

  const [stacLoading, setStacLoading] = useState(false);
  const [stacError, setStacError] = useState<string | null>(null);
  const [stacItems, setStacItems] = useState<StacSearchFeature[]>([]);
  const [selectedStacId, setSelectedStacId] = useState<string | null>(null);
  const [stacStyle, setStacStyle] = useState<StacTileStyle>("natural");
  const [showStacOnMap, setShowStacOnMap] = useState(true);
  const [manualStacPick, setManualStacPick] = useState(false);

  const parcelKey = useMemo(() => {
    if (feature.id !== undefined && feature.id !== null) {
      return String(feature.id);
    }
    const p = feature.properties as Record<string, unknown> | null;
    const id = p?._id ?? p?.parcel_id;
    if (id !== undefined && id !== null) return String(id);
    return JSON.stringify(feature.geometry);
  }, [feature]);

  const clusterImageryHints = useMemo(
    () =>
      clusterImageryHintsFromGeojson(clusterGeojson, selectedClusterId),
    [clusterGeojson, selectedClusterId]
  );

  useEffect(() => {
    setManualStacPick(false);
  }, [parcelKey, selectedClusterId]);

  useEffect(() => {
    let cancelled = false;
    const box = bboxFromFeature(feature);
    if (!box) {
      setStacError("Geometrie de parcelle non supportee");
      setStacItems([]);
      return;
    }
    setStacLoading(true);
    setStacError(null);
    const qs = new URLSearchParams();
    qs.set("bbox", box.join(","));
    qs.set("limit", "40");
    fetch(`/api/stac/search?${qs.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + String(res.status));
        return res.json() as Promise<{ features?: StacSearchFeature[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        const feats = data.features ?? [];
        const withCog = feats.filter((f) => cogHrefFromStacFeature(f));
        const sorted = [...withCog].sort(
          (a, b) =>
            parseStacDatetime(b.properties?.datetime) -
            parseStacDatetime(a.properties?.datetime)
        );
        setStacItems(sorted);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStacError(
            e instanceof Error ? e.message : "Erreur API satellite"
          );
          setStacItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setStacLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [feature]);

  useEffect(() => {
    if (stacItems.length === 0) {
      setSelectedStacId(null);
      return;
    }
    if (manualStacPick) return;
    const pick = pickStacItemForCluster(stacItems, clusterImageryHints);
    const id = pick?.id ?? stacItems[0].id;
    setSelectedStacId(id);
  }, [stacItems, clusterImageryHints, manualStacPick]);

  const selectedStac = useMemo(
    () => stacItems.find((x) => x.id === selectedStacId) ?? null,
    [stacItems, selectedStacId]
  );

  useEffect(() => {
    const dt = selectedStac?.properties?.datetime;
    setStacAnnotationDatetime(
      typeof dt === "string" && dt.trim() !== "" ? dt.trim() : null
    );
    setStacAnnotationItemId(
      selectedStac?.id && selectedStac.id.trim() !== ""
        ? selectedStac.id.trim()
        : null
    );
  }, [selectedStac, setStacAnnotationDatetime, setStacAnnotationItemId]);

  useEffect(() => {
    if (!showStacOnMap || !selectedStac) {
      setStacOverlay(null);
      return;
    }
    const href = cogHrefFromStacFeature(selectedStac);
    if (!href) {
      setStacOverlay(null);
      return;
    }
    const bpp = bitsPerPixelFromStacFeature(selectedStac);
    setStacOverlay({
      tilesUrl: buildRasterTilesUrl(stacApiBase, href, stacStyle, bpp),
      itemId: selectedStac.id,
      style: stacStyle,
    });
  }, [
    showStacOnMap,
    selectedStac,
    stacStyle,
    stacApiBase,
    setStacOverlay,
  ]);

  const props = feature.properties as Record<string, unknown> | null;
  const title =
    (typeof props?.commune === "string" && props.commune) ||
    (typeof props?._id === "string" && props._id) ||
    (typeof props?.num_lot === "string" && `Lot ${props.num_lot}`) ||
    "Parcelle";

  const parcelMongoPieData = useMemo(
    () =>
      parcelMongoDetail?.entries?.length
        ? pieSlicesFromMongo(parcelMongoDetail.entries)
        : [],
    [parcelMongoDetail]
  );

  const cultureChartLegend = useMemo(() => {
    const rows = parcelMongoPieData;
    const total = rows.reduce((acc, r) => acc + r.value, 0);
    if (rows.length === 0 || total <= 0) return [];
    return rows.map((r, i) => ({
      key: r.name + "-" + String(i),
      cultureLabel: r.name,
      surfaceHa: r.value,
      pct: (r.value / total) * 100,
      vegCode: r.vegCode,
    }));
  }, [parcelMongoPieData]);

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-white text-emerald-950">
      <div className="flex items-start justify-between gap-2 border-b border-emerald-900/15 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">Fiche parcelle</h2>
          <p className="mt-0.5 truncate text-xs text-emerald-800/90" title={title}>
            {title}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <section
          className="mb-4 rounded-md border border-emerald-900/15 bg-emerald-50/80 p-2.5"
          data-tour="parcel-detail-stac"
        >
          <h3 className="text-xs font-semibold text-emerald-900">
            Image satellite (STAC)
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-emerald-800/85">
            Recherche dans le catalogue via l&apos;emprise de la parcelle
            (bbox), puis tuiles TiTiler.
            {clusterImageryHints ? (
              <>
                {" "}
                Scene par defaut : COG / date majoritaires du cluster selectionne
                (tu peux changer dans la liste).
              </>
            ) : null}
          </p>
          <label className="mt-2 block text-[11px] font-medium text-emerald-900">
            Opacite des calques (parcelles, clusters, mailles IA)
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
          {stacLoading ? (
            <p className="mt-2 text-xs text-emerald-800">Chargement...</p>
          ) : null}
          {stacError ? (
            <p className="mt-2 text-xs text-red-700">{stacError}</p>
          ) : null}
          {!stacLoading && !stacError && stacItems.length === 0 ? (
            <p className="mt-2 text-xs text-emerald-800">
              Aucune scene ne couvre cette emprise dans le catalogue.
            </p>
          ) : null}
          {!stacLoading && stacItems.length > 0 ? (
            <div className="mt-2 space-y-2">
              <label className="block text-[11px] font-medium text-emerald-900">
                Scene / acquisition
                <select
                  className="mt-0.5 w-full rounded border border-emerald-800/20 bg-white px-2 py-1 text-xs text-emerald-950"
                  value={selectedStacId ?? ""}
                  onChange={(e) => {
                    setManualStacPick(true);
                    setSelectedStacId(e.target.value || null);
                  }}
                >
                  {stacItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.properties?.datetime ?? it.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-1.5" data-tour="parcel-style-tools">
                <span className="w-full text-[11px] font-medium text-emerald-900">
                  Style
                </span>
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
                    className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                      stacStyle === val
                        ? "border-emerald-700 bg-emerald-200 text-emerald-950"
                        : "border-emerald-800/25 bg-white text-emerald-900 hover:bg-emerald-100/80"
                    }`}
                    onClick={() => setStacStyle(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[11px] text-emerald-900">
                <input
                  type="checkbox"
                  checked={showStacOnMap}
                  onChange={(e) => setShowStacOnMap(e.target.checked)}
                  className="rounded border-emerald-800/40"
                />
                Superposer sur la carte
              </label>
            </div>
          ) : null}
        </section>

        <dl className="space-y-2.5 text-sm" data-tour="parcel-data-list">
          {orderedPropertyEntries(props).map(([key, value]) => (
            <div key={key} className="border-b border-emerald-900/10 pb-2 last:border-0">
              <dt className="text-xs font-medium text-emerald-800/90">
                {labelForPropertyKey(key)}
              </dt>
              <dd className="mt-0.5 break-words text-emerald-950">
                {formatPropertyValue(value)}
              </dd>
            </div>
          ))}
        </dl>

        <section
          className="mt-4 border-t border-emerald-900/15 pt-4"
          data-tour="parcel-detail-ia"
        >
          <h3 className="text-sm font-semibold text-emerald-900">
            Type de culture
          </h3>
          {parcelMongoLoading ? (
            <p className="mt-2 text-xs text-emerald-800">Chargement MongoDB...</p>
          ) : parcelMongoError ? (
            <p className="mt-2 text-xs text-red-700">{parcelMongoError}</p>
          ) : parcelMongoDetail == null ||
            parcelMongoDetail.totalCells === 0 ? (
            <p className="mt-2 text-xs leading-snug text-emerald-800">
              Aucun point IA exploitable pour ce lot : il faut au moins un document
              dans <span className="font-mono">AI</span> avec{" "}
              <span className="font-mono">geometry</span> Point (coord. dans la
              parcelle ou <span className="font-mono">dag_feature_id</span> /{" "}
              <span className="font-mono">_id</span> alignes avec la parcelle ;
              index 2dsphere sur <span className="font-mono">geometry</span>). Les
              docs sans categorie utilisent le libelle &quot;A labelliser&quot; (24).
            </p>
          ) : parcelMongoPieData.length === 0 ? (
            <p className="mt-2 text-xs text-emerald-800">
              Donnees sans categorie exploitable.
            </p>
          ) : (
            <div className="mt-3">
              <p className="mb-2 text-[11px] text-emerald-800/90">
                Total ~{" "}
                {(parcelMongoDetail.totalCells * parcelMongoDetail.cellSurfaceHa).toLocaleString(
                  "fr-FR",
                  { maximumFractionDigits: 2 }
                )}{" "}
                ha ({parcelMongoDetail.totalCells.toLocaleString("fr-FR")}{" "}
                mailles).
              </p>
              <div className="h-64 w-full min-h-[14rem]">
                <VegCatPieChart data={parcelMongoPieData} />
              </div>
              <ul
                className="mt-3 list-none space-y-2 border-t border-emerald-900/10 pt-3"
                aria-label="Legende type de culture"
              >
                {cultureChartLegend.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-start gap-2 text-xs leading-snug text-emerald-950"
                  >
                    <span
                      className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-emerald-900/20"
                      style={{
                        backgroundColor: fillForVegCatCode(row.vegCode),
                      }}
                      aria-hidden
                    />
                    <span>
                      <span className="font-medium text-emerald-900">
                        {row.cultureLabel}
                      </span>
                      {" — "}
                      {row.surfaceHa.toLocaleString("fr-FR", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      ha (
                      {row.pct.toLocaleString("fr-FR", {
                        maximumFractionDigits: 1,
                      })}
                      %)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
      <div className="shrink-0 border-t border-emerald-900/15 bg-emerald-50/60 px-3 py-2.5">
        <button
          type="button"
          className="w-full rounded-md bg-emerald-800 px-3 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          onClick={() => setManualEditPanelOpen(true)}
          data-tour="parcel-open-manual-edit"
        >
          Annoter manuellement
        </button>
        <p className="mt-1.5 text-center text-[10px] leading-snug text-emerald-800/80">
          Clique les mailles IA sur la carte, veg_cat, meme periode que l&apos;image
          STAC ci-dessus.
        </p>
      </div>
    </div>
  );
}
