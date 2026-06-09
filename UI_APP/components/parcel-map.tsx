"use client";

import {
  Layer,
  Map,
  Marker,
  NavigationControl,
  Source,
  type MapRef,
} from "@vis.gl/react-maplibre";
import type {
  FilterSpecification,
  MapLayerMouseEvent,
  MapLibreEvent,
} from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Point } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParcelApp } from "@/context/parcel-app-context";
import { boundsDensestClusterCells } from "@/lib/cluster-density-focus";
import { bboxFromFeature, bboxFromFeatureCollection } from "@/lib/bbox";
import {
  mailleCenterKey,
  mailleCentersInLngLatRectangle,
} from "@/lib/manual-maille-selection";
import { parcelStableSelectionKey } from "@/lib/parcel-selection-key";
import { featureMatchesFilters } from "@/lib/parcel-filters";

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const PARCEL_LAYERS = ["parcels-fill", "parcels-outline"];

const PARCEL_MONGO_IA_HOVER_LAYERS = ["parcel-mongo-ia-fill"] as const;

function parcelMongoIaFillLayerOnMap(map: maplibregl.Map): boolean {
  return map.getLayer("parcel-mongo-ia-fill") != null;
}

type MongoIaHoverTip = {
  clientX: number;
  clientY: number;
  categoryName: string;
  accuracyPercent: number | null;
  manualIsSet: boolean;
  manualChecked: boolean;
};

interface ParcelMapProps {
  data: FeatureCollection | null;
  layerFilter: FilterSpecification | undefined;
}

export default function ParcelMap({ data, layerFilter }: ParcelMapProps) {
  const {
    setSelectedParcel,
    selectedParcel,
    manualEditPanelOpen,
    manualSelectedCells,
    setManualSelectedCells,
    filters,
    stacOverlay,
    vectorLayersOpacity,
    clusterGeojson,
    selectedClusterId,
    parcelMongoDetail,
  } = useParcelApp();
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [coordPin, setCoordPin] = useState<{ lng: number; lat: number } | null>(
    null
  );
  const [coordCopiedFlash, setCoordCopiedFlash] = useState(false);
  const [mongoIaHoverTip, setMongoIaHoverTip] =
    useState<MongoIaHoverTip | null>(null);
  /** Apercu rectangle Maj + glisser (annotation manuelle). */
  const [manualZoneSelectBox, setManualZoneSelectBox] =
    useState<FeatureCollection | null>(null);
  const parcelHoverBlockedRef = useRef(false);
  /** Evite un reclic maille juste apres une selection zone (Shift+glisser). */
  const suppressManualToggleClickRef = useRef(false);

  const manualParcelEdit =
    manualEditPanelOpen && selectedParcel != null;

  /** Pas de selection / deselection parcelle : mode annotation manuelle. */
  const parcelInteractionBlocked = manualEditPanelOpen && selectedParcel != null;

  parcelHoverBlockedRef.current = parcelInteractionBlocked;

  const filteredForBounds = useMemo(() => {
    if (!data) return [];
    return data.features.filter((f) => featureMatchesFilters(f, filters));
  }, [data, filters]);

  /**
   * A faible zoom, les polygones deviennent trop petits a l ecran.
   * On affiche alors des points de synthese (centres approximatifs) pour garder
   * les parcelles visibles sans surcharger la carte.
   */
  const overviewParcelPoints = useMemo((): FeatureCollection<Point> => {
    const points: Feature<Point>[] = [];
    for (const f of filteredForBounds) {
      const b = bboxFromFeature(f);
      if (!b) continue;
      const lon = (b[0] + b[2]) / 2;
      const lat = (b[1] + b[3]) / 2;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      points.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [lon, lat] },
      });
    }
    return { type: "FeatureCollection", features: points };
  }, [filteredForBounds]);

  const selectedParcelOutlineData = useMemo((): FeatureCollection | null => {
    if (!selectedParcel?.geometry) return null;
    return {
      type: "FeatureCollection",
      features: [selectedParcel],
    };
  }, [selectedParcel]);

  const hideBaseParcelPaint = selectedParcel != null;

  const vectorOpacity = useMemo(
    () => Math.min(1, Math.max(0, vectorLayersOpacity)),
    [vectorLayersOpacity]
  );

  const mongoIaLayerRemountKey = useMemo(
    () => parcelStableSelectionKey(selectedParcel),
    [selectedParcel]
  );

  /** Raster STAC toujours sous les couches vecteur (meme si les tuiles arrivent apres). */
  const stacRasterBeforeLayerId = useMemo(() => {
    if (clusterGeojson != null && selectedClusterId != null) {
      return "cluster-vectors-fill";
    }
    return "parcels-fill";
  }, [clusterGeojson, selectedClusterId]);

  const manualMailleSelectionData = useMemo((): FeatureCollection | null => {
    if (
      !manualParcelEdit ||
      !parcelMongoDetail?.overlay.features.length ||
      manualSelectedCells.length === 0
    )
      return null;
    const keys = new Set(
      manualSelectedCells.map((c) => mailleCenterKey(c.lon, c.lat))
    );
    const features = parcelMongoDetail.overlay.features.filter((f) => {
      const p = f.properties as Record<string, unknown>;
      const lon = Number(p.centerLon);
      const lat = Number(p.centerLat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
      return keys.has(mailleCenterKey(lon, lat));
    });
    if (features.length === 0) return null;
    return { type: "FeatureCollection", features };
  }, [manualParcelEdit, parcelMongoDetail, manualSelectedCells]);

  useEffect(() => {
    if (!mapLoaded || !parcelMongoDetail?.overlay.features.length) {
      setMongoIaHoverTip(null);
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;

    const parseMongoIaFeatureProps = (
      feat: Feature
    ): {
      categoryName: string;
      accuracyPercent: number | null;
      manualIsSet: boolean;
      manualChecked: boolean;
    } => {
      const p = feat.properties as Record<string, unknown> | null | undefined;
      const bag = p ?? {};
      const name = String(bag.category_name ?? "");
      const raw = bag.accuracyPercent;
      let acc: number | null = null;
      if (typeof raw === "number" && Number.isFinite(raw)) acc = raw;
      else if (raw != null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) acc = n;
      }
      return {
        categoryName: name,
        accuracyPercent: acc,
        manualIsSet: bag.manualIsSet === true,
        manualChecked: bag.manualChecked === true,
      };
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!parcelMongoIaFillLayerOnMap(map)) {
        setMongoIaHoverTip(null);
        return;
      }
      let feats: maplibregl.MapGeoJSONFeature[];
      try {
        feats = map.queryRenderedFeatures(e.point, {
          layers: [...PARCEL_MONGO_IA_HOVER_LAYERS],
        });
      } catch {
        setMongoIaHoverTip(null);
        return;
      }
      if (!feats.length) {
        setMongoIaHoverTip(null);
        return;
      }
      const top = feats[0] as unknown as Feature;
      const { categoryName, accuracyPercent, manualIsSet, manualChecked } =
        parseMongoIaFeatureProps(top);
      setMongoIaHoverTip({
        clientX: e.originalEvent.clientX,
        clientY: e.originalEvent.clientY,
        categoryName,
        accuracyPercent,
        manualIsSet,
        manualChecked,
      });
    };

    const clearTip = () => setMongoIaHoverTip(null);

    map.on("mousemove", onMove);
    map.on("mouseout", clearTip);

    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", clearTip);
      setMongoIaHoverTip(null);
    };
  }, [mapLoaded, parcelMongoDetail?.overlay]);

  /** Selection rectangle : Maj + glisser pour ajouter toutes les mailles dans la zone. */
  useEffect(() => {
    if (!mapLoaded || !manualParcelEdit || !parcelMongoDetail?.overlay.features.length) {
      setManualZoneSelectBox(null);
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;

    const overlay = parcelMongoDetail.overlay;

    type DragSnap = {
      startLngLat: maplibregl.LngLat;
      startClientX: number;
      startClientY: number;
    };
    let dragSnap: DragSnap | null = null;

    const enablePan = () => {
      try {
        map.dragPan.enable();
      } catch {
        /* ignore */
      }
    };

    const disablePan = () => {
      try {
        map.dragPan.disable();
      } catch {
        /* ignore */
      }
    };

    const boxFeatureCollection = (
      a: maplibregl.LngLat,
      b: maplibregl.LngLat
    ): FeatureCollection => {
      const w = Math.min(a.lng, b.lng);
      let e = Math.max(a.lng, b.lng);
      const s = Math.min(a.lat, b.lat);
      let n = Math.max(a.lat, b.lat);
      if (e - w < 1e-12) {
        e += 1e-9;
      }
      if (n - s < 1e-12) {
        n += 1e-9;
      }
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [w, s],
                  [e, s],
                  [e, n],
                  [w, n],
                  [w, s],
                ],
              ],
            },
          },
        ],
      };
    };

    const finishZoneDrag = (
      endLngLat: maplibregl.LngLat,
      endClientX: number,
      endClientY: number
    ) => {
      if (!dragSnap) return;
      const snap = dragSnap;
      dragSnap = null;
      enablePan();
      setManualZoneSelectBox(null);

      const dx = endClientX - snap.startClientX;
      const dy = endClientY - snap.startClientY;
      if (Math.hypot(dx, dy) < 8) {
        return;
      }

      const picks = mailleCentersInLngLatRectangle(
        overlay,
        snap.startLngLat.lng,
        snap.startLngLat.lat,
        endLngLat.lng,
        endLngLat.lat
      );
      if (picks.length === 0) {
        return;
      }

      suppressManualToggleClickRef.current = true;
      setManualSelectedCells((prev) => {
        const keys = new Set(prev.map((c) => mailleCenterKey(c.lon, c.lat)));
        const merged = [...prev];
        for (const c of picks) {
          const k = mailleCenterKey(c.lon, c.lat);
          if (!keys.has(k)) {
            keys.add(k);
            merged.push(c);
          }
        }
        return merged;
      });
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (!e.originalEvent.shiftKey || e.originalEvent.button !== 0) return;
      dragSnap = {
        startLngLat: e.lngLat,
        startClientX: e.originalEvent.clientX,
        startClientY: e.originalEvent.clientY,
      };
      disablePan();
      setManualZoneSelectBox(boxFeatureCollection(e.lngLat, e.lngLat));
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!dragSnap) return;
      setManualZoneSelectBox(
        boxFeatureCollection(dragSnap.startLngLat, e.lngLat)
      );
    };

    const onMouseUpMap = (e: maplibregl.MapMouseEvent) => {
      if (!dragSnap) return;
      finishZoneDrag(
        e.lngLat,
        e.originalEvent.clientX,
        e.originalEvent.clientY
      );
    };

    const onMouseUpWindow = (ev: MouseEvent) => {
      if (!dragSnap) return;
      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const ll = map.unproject([x, y]);
      finishZoneDrag(ll, ev.clientX, ev.clientY);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (!dragSnap) return;
      dragSnap = null;
      enablePan();
      setManualZoneSelectBox(null);
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUpMap);
    window.addEventListener("mouseup", onMouseUpWindow);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUpMap);
      window.removeEventListener("mouseup", onMouseUpWindow);
      window.removeEventListener("keydown", onKeyDown);
      enablePan();
      dragSnap = null;
      setManualZoneSelectBox(null);
    };
  }, [
    mapLoaded,
    manualParcelEdit,
    parcelMongoDetail?.overlay,
    setManualSelectedCells,
  ]);

  useEffect(() => {
    if (selectedClusterId != null) return;
    if (!mapLoaded || filteredForBounds.length === 0) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = bboxFromFeatureCollection({
      type: "FeatureCollection",
      features: filteredForBounds,
    });
    map.fitBounds(b, { padding: 52, maxZoom: 15, duration: 750 });
  }, [mapLoaded, filteredForBounds, selectedClusterId]);

  useEffect(() => {
    if (!mapLoaded || !selectedParcel) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = bboxFromFeature(selectedParcel);
    if (!b) return;
    map.fitBounds(b, { padding: 64, maxZoom: 18, duration: 650 });
  }, [mapLoaded, selectedParcel]);

  const clusterLayerFilter = useMemo((): FilterSpecification | undefined => {
    if (selectedClusterId == null) return undefined;
    return [
      "==",
      ["get", "cluster_id"],
      selectedClusterId,
    ];
  }, [selectedClusterId]);

  const clusterFocusFeatures = useMemo(() => {
    if (selectedClusterId == null || !clusterGeojson) return [];
    return clusterGeojson.features.filter(
      (f) =>
        (f.properties as { cluster_id?: number }).cluster_id ===
        selectedClusterId
    );
  }, [clusterGeojson, selectedClusterId]);

  useEffect(() => {
    if (!mapLoaded || selectedClusterId == null || clusterFocusFeatures.length === 0)
      return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const dense = boundsDensestClusterCells(clusterFocusFeatures);
    const b =
      dense ??
      bboxFromFeatureCollection({
        type: "FeatureCollection",
        features: clusterFocusFeatures,
      });
    map.fitBounds(b, { padding: 28, maxZoom: 20, duration: 680 });
  }, [mapLoaded, selectedClusterId, clusterFocusFeatures]);

  const handleContextMenu = useCallback((e: MapLayerMouseEvent) => {
    e.originalEvent.preventDefault();
    const ll = e.lngLat;
    setCoordCopiedFlash(false);
    setCoordPin({ lng: ll.lng, lat: ll.lat });
  }, []);

  const copyCoordPinText = useCallback(async () => {
    if (!coordPin) return;
    const line = `${coordPin.lat.toFixed(6)}, ${coordPin.lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(line);
      setCoordCopiedFlash(true);
      window.setTimeout(() => setCoordCopiedFlash(false), 900);
    } catch {
      /* ignore */
    }
  }, [coordPin]);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (
        manualParcelEdit &&
        parcelMongoDetail != null &&
        parcelMongoDetail.overlay.features.length > 0
      ) {
        if (suppressManualToggleClickRef.current) {
          suppressManualToggleClickRef.current = false;
          return;
        }
        const map = mapRef.current?.getMap();
        if (map && parcelMongoIaFillLayerOnMap(map)) {
          let feats: maplibregl.MapGeoJSONFeature[];
          try {
            feats = map.queryRenderedFeatures(e.point, {
              layers: [...PARCEL_MONGO_IA_HOVER_LAYERS],
            });
          } catch {
            return;
          }
          if (feats.length > 0) {
            const feat = feats[0] as unknown as Feature;
            const p = feat.properties as Record<string, unknown>;
            const lon = Number(p.centerLon);
            const lat = Number(p.centerLat);
            if (Number.isFinite(lon) && Number.isFinite(lat)) {
              const key = mailleCenterKey(lon, lat);
              setManualSelectedCells((prev) => {
                const idx = prev.findIndex(
                  (c) => mailleCenterKey(c.lon, c.lat) === key
                );
                if (idx >= 0) {
                  return prev.filter((_, i) => i !== idx);
                }
                return [...prev, { lon, lat }];
              });
            }
            return;
          }
        }
        return;
      }

      if (parcelInteractionBlocked) return;
      const top = e.features?.[0];
      if (top && top.properties !== undefined) {
        const feat: Feature = {
          type: "Feature",
          properties: top.properties,
          geometry: top.geometry,
        };
        if (top.id !== undefined) {
          feat.id = top.id as Feature["id"];
        }
        setSelectedParcel(feat);
      } else {
        setSelectedParcel(null);
      }
    },
    [
      manualParcelEdit,
      parcelMongoDetail,
      parcelInteractionBlocked,
      setManualSelectedCells,
      setSelectedParcel,
    ]
  );

  const handleLoad = useCallback((e: MapLibreEvent) => {
    setMapLoaded(true);
    const map = e.target;
    map.on("mouseenter", "parcels-fill", () => {
      if (parcelHoverBlockedRef.current) return;
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "parcels-fill", () => {
      if (parcelHoverBlockedRef.current) return;
      map.getCanvas().style.cursor = "";
    });
  }, []);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-emerald-50 text-emerald-900">
        Chargement des parcelles...
      </div>
    );
  }

  return (
    <>
    <Map
      ref={mapRef}
      mapLib={maplibregl}
      mapStyle={MAP_STYLE}
      initialViewState={{
        longitude: -151.35,
        latitude: -22.45,
        zoom: 11,
      }}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={
        parcelInteractionBlocked ? [] : PARCEL_LAYERS
      }
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onLoad={handleLoad}
    >
      <NavigationControl position="top-right" />
      {coordPin ? (
        <Marker
          longitude={coordPin.lng}
          latitude={coordPin.lat}
          anchor="center"
        >
          <div className="pointer-events-auto relative flex flex-col items-center">
            <button
              type="button"
              title="Fermer"
              aria-label="Fermer le marqueur"
              className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold leading-none text-white shadow hover:bg-red-700"
              onClick={(ev) => {
                ev.stopPropagation();
                setCoordPin(null);
              }}
            >
              x
            </button>
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              className="drop-shadow-md"
              aria-hidden
            >
              <line
                x1="14"
                y1="2"
                x2="14"
                y2="26"
                stroke="#b91c1c"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <line
                x1="2"
                y1="14"
                x2="26"
                y2="14"
                stroke="#b91c1c"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="14" cy="14" r="3" fill="#fef2f2" stroke="#b91c1c" strokeWidth="1.5" />
            </svg>
            <button
              type="button"
              title="Cliquer pour copier"
              className={`mt-0.5 max-w-[16rem] rounded border bg-white/95 px-1.5 py-0.5 text-center font-mono text-[10px] leading-tight text-slate-900 shadow-sm hover:bg-slate-50 ${
                coordCopiedFlash
                  ? "border-green-600 ring-1 ring-green-500"
                  : "border-slate-300"
              }`}
              onClick={(ev) => {
                ev.stopPropagation();
                void copyCoordPinText();
              }}
            >
              {coordPin.lat.toFixed(6)}, {coordPin.lng.toFixed(6)}
            </button>
          </div>
        </Marker>
      ) : null}
      {clusterGeojson && selectedClusterId != null ? (
        <Source id="cluster-vectors" type="geojson" data={clusterGeojson}>
          <Layer
            id="cluster-vectors-fill"
            type="fill"
            filter={clusterLayerFilter}
            paint={{
              "fill-color": "#dc2626",
              "fill-opacity": 0.45 * vectorOpacity,
            }}
          />
          <Layer
            id="cluster-vectors-outline"
            type="line"
            filter={clusterLayerFilter}
            paint={{
              "line-color": "#991b1b",
              "line-width": 1.5,
              "line-opacity": vectorOpacity,
            }}
          />
        </Source>
      ) : null}
      <Source id="parcels" type="geojson" data={data}>
        <Layer
          id="parcels-fill"
          type="fill"
          paint={{
            "fill-color": "#16a34a",
            "fill-opacity": hideBaseParcelPaint ? 0 : 0.42 * vectorOpacity,
          }}
          {...(layerFilter != null ? { filter: layerFilter } : {})}
        />
        <Layer
          id="parcels-outline"
          type="line"
          paint={{
            "line-color": "#14532d",
            "line-width": 1,
            "line-opacity": hideBaseParcelPaint ? 0 : vectorOpacity,
          }}
          {...(layerFilter != null ? { filter: layerFilter } : {})}
        />
      </Source>
      {overviewParcelPoints.features.length > 0 ? (
        <Source id="parcels-overview-points" type="geojson" data={overviewParcelPoints}>
          <Layer
            id="parcels-overview-circles"
            type="circle"
            maxzoom={11}
            paint={{
              "circle-color": "#16a34a",
              "circle-opacity": 0.78 * vectorOpacity,
              "circle-stroke-color": "#14532d",
              "circle-stroke-width": 1,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                4, 1.8,
                8, 3.2,
                11, 4.6,
              ],
            }}
          />
        </Source>
      ) : null}
      {selectedParcel &&
      parcelMongoDetail != null &&
      parcelMongoDetail.overlay.features.length > 0 ? (
        <Source
          key={`parcel-mongo-ia-${mongoIaLayerRemountKey}`}
          id="parcel-mongo-ia"
          type="geojson"
          data={parcelMongoDetail.overlay}
        >
          <Layer
            id="parcel-mongo-ia-fill"
            type="fill"
            paint={{
              "fill-color": ["get", "fillColor"],
              "fill-opacity": 0.32 * vectorOpacity,
            }}
          />
          <Layer
            id="parcel-mongo-ia-outline"
            type="line"
            paint={{
              "line-color": ["get", "fillColor"],
              "line-width": 0.85,
              "line-opacity": 0.75 * vectorOpacity,
            }}
          />
          <Layer
            id="parcel-mongo-ia-manual-pending-outline"
            type="line"
            filter={[
              "all",
              ["==", ["get", "manualIsSet"], true],
              ["!=", ["get", "manualChecked"], true],
            ]}
            paint={{
              "line-color": "#f59e0b",
              "line-width": 2.1,
              "line-opacity": 0.95 * vectorOpacity,
            }}
          />
          <Layer
            id="parcel-mongo-ia-manual-pending-label"
            type="symbol"
            filter={[
              "all",
              ["==", ["get", "manualIsSet"], true],
              ["!=", ["get", "manualChecked"], true],
            ]}
            layout={{
              "text-field": ["coalesce", ["get", "category_label"], ""],
              "text-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12, 8,
                15, 10,
                18, 12,
              ],
              "text-anchor": "center",
              "text-justify": "center",
              "text-max-width": 6,
            }}
            paint={{
              "text-color": "#ffffff",
              "text-halo-color": "#111827",
              "text-halo-width": 1.2,
              "text-halo-blur": 0.2,
            }}
          />
        </Source>
      ) : null}
      {selectedParcelOutlineData ? (
        <Source id="parcel-selected" type="geojson" data={selectedParcelOutlineData}>
          <Layer
            id="parcel-selected-outline"
            type="line"
            paint={{
              "line-color": "#dc2626",
              "line-width": 2.5,
              "line-opacity": vectorOpacity,
            }}
          />
        </Source>
      ) : null}
      {manualMailleSelectionData &&
      manualMailleSelectionData.features.length > 0 ? (
        <Source
          id="manual-maille-selection"
          type="geojson"
          data={manualMailleSelectionData}
        >
          <Layer
            id="manual-maille-selection-line"
            type="line"
            paint={{
              "line-color": "#dc2626",
              "line-width": 3.2,
              "line-opacity": vectorOpacity,
            }}
          />
        </Source>
      ) : null}
      {manualParcelEdit &&
      manualZoneSelectBox != null &&
      manualZoneSelectBox.features.length > 0 ? (
        <Source
          id="manual-zone-select-preview"
          type="geojson"
          data={manualZoneSelectBox}
        >
          <Layer
            id="manual-zone-select-fill"
            type="fill"
            paint={{
              "fill-color": "#f59e0b",
              "fill-opacity": 0.14,
            }}
          />
          <Layer
            id="manual-zone-select-outline"
            type="line"
            paint={{
              "line-color": "#d97706",
              "line-width": 2,
              "line-dasharray": [2, 2],
              "line-opacity": 0.95,
            }}
          />
        </Source>
      ) : null}
      {stacOverlay ? (
        <Source
          key={`${stacOverlay.itemId}:${stacOverlay.style}:${stacOverlay.tilesUrl.slice(-80)}`}
          id="stac-raster"
          type="raster"
          tiles={[stacOverlay.tilesUrl]}
          tileSize={256}
        >
          <Layer
            id="stac-raster-layer"
            type="raster"
            beforeId={stacRasterBeforeLayerId}
            paint={{
              "raster-opacity": 1,
              "raster-fade-duration": 0,
            }}
          />
        </Source>
      ) : null}
    </Map>
    {mongoIaHoverTip ? (
      <div
        className="pointer-events-none fixed z-[1000] max-w-[14rem] rounded border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs text-slate-900 shadow-md"
        style={{
          left: mongoIaHoverTip.clientX + 14,
          top: mongoIaHoverTip.clientY + 14,
        }}
      >
        <div className="font-medium leading-snug">{mongoIaHoverTip.categoryName}</div>
        {mongoIaHoverTip.accuracyPercent != null ? (
          <div className="mt-0.5 text-[11px] text-slate-700">
            Precision :{" "}
            {mongoIaHoverTip.accuracyPercent.toLocaleString("fr-FR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 2,
            })}{" "}
            %
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-slate-500">
            Precision : n/d
          </div>
        )}
      </div>
    ) : null}
    </>
  );
}
