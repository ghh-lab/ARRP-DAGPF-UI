"use client";

import type { Feature, FeatureCollection } from "geojson";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  buildLayerFilter,
  collectDistinctField,
  featureMatchesFilters,
  filtersMatchFullDataset,
  surfaceRange,
  type ParcelFilters,
} from "@/lib/parcel-filters";
import type { ClusterLabelEntry } from "@/lib/cluster-label-types";
import type { ClusterRankingEntry } from "@/lib/cluster-types";
import type {
  ParcelMongoDetailOk,
  ParcelMongoDetailResponse,
} from "@/lib/parcel-mongo-detail-types";
import type { ManualSelectedCellCenter } from "@/lib/manual-maille-selection";
import { parcelStableSelectionKey } from "@/lib/parcel-selection-key";
import { parcelSurfaceKm2FromProps } from "@/lib/parcel-surface-km2";
import type { StacOverlayState } from "@/lib/stac";

type DrawerKey =
  | "map"
  | "data"
  | "charts"
  | "labeling"
  | "review"
  | "help"
  | "settings"
  | "tickets"
  | "satellite";

interface ParcelAppState {
  data: FeatureCollection | null;
  loadError: string | null;
  loading: boolean;
  filters: ParcelFilters;
  setFilters: (f: ParcelFilters | ((prev: ParcelFilters) => ParcelFilters)) => void;
  resetFilters: () => void;
  layerFilter: ReturnType<typeof buildLayerFilter>;
  filteredFeatureCount: number;
  communes: string[];
  productionTypes: string[];
  typeParcelles: string[];
  surfaceBounds: { min: number; max: number };
  activeDrawer: DrawerKey;
  setActiveDrawer: (k: DrawerKey) => void;
  selectedParcel: Feature | null;
  setSelectedParcel: (f: Feature | null) => void;
  stacOverlay: StacOverlayState | null;
  setStacOverlay: (o: StacOverlayState | null) => void;
  /** Multiplicateur d opacite pour parcelles, clusters, mailles IA, etc. (pas l image STAC). */
  vectorLayersOpacity: number;
  setVectorLayersOpacity: Dispatch<SetStateAction<number>>;
  clusterRanking: ClusterRankingEntry[] | null;
  clusterGeojson: FeatureCollection | null;
  clusterDataLoading: boolean;
  clusterDataError: string | null;
  loadClusterData: (opts?: { force?: boolean }) => Promise<void>;
  selectedClusterId: number | null;
  setSelectedClusterId: (id: number | null) => void;
  clusterLabels: Record<number, ClusterLabelEntry>;
  refreshClusterLabels: () => Promise<void>;
  manualSelectedCells: ManualSelectedCellCenter[];
  setManualSelectedCells: Dispatch<
    SetStateAction<ManualSelectedCellCenter[]>
  >;
  stacAnnotationDatetime: string | null;
  setStacAnnotationDatetime: (s: string | null) => void;
  stacAnnotationItemId: string | null;
  setStacAnnotationItemId: (s: string | null) => void;
  /** Incremente pour forcer le rechargement du camembert veg_cat dans la fiche parcelle. */
  parcelVegPieRevision: number;
  bumpParcelVegPieRevision: () => void;
  /** Mailles IA Mongo dont le point tombe dans la parcelle selectionnee + enveloppes par classe. */
  parcelMongoDetail: ParcelMongoDetailOk | null;
  parcelMongoLoading: boolean;
  parcelMongoError: string | null;
  /** Panneau gauche annotation manuelle : ouvert uniquement depuis la fiche parcelle. */
  manualEditPanelOpen: boolean;
  setManualEditPanelOpen: Dispatch<SetStateAction<boolean>>;
}

const ParcelAppContext = createContext<ParcelAppState | null>(null);

function defaultFiltersFromMax(maxSurface: number): ParcelFilters {
  return {
    commune: "",
    productionType: "",
    typeParcelle: "",
    surfaceMin: 0,
    surfaceMax: maxSurface,
  };
}

export function ParcelAppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ParcelFilters>(
    defaultFiltersFromMax(1e9)
  );
  const [activeDrawer, setActiveDrawer] = useState<DrawerKey>("map");
  const [selectedParcel, setSelectedParcel] = useState<Feature | null>(null);
  const selectedParcelRef = useRef<Feature | null>(null);
  selectedParcelRef.current = selectedParcel;
  const [stacOverlay, setStacOverlay] = useState<StacOverlayState | null>(
    null
  );
  const [vectorLayersOpacity, setVectorLayersOpacity] = useState(1);
  const [clusterRanking, setClusterRanking] = useState<
    ClusterRankingEntry[] | null
  >(null);
  const [clusterGeojson, setClusterGeojson] = useState<FeatureCollection | null>(
    null
  );
  const [clusterDataLoading, setClusterDataLoading] = useState(false);
  const [clusterDataError, setClusterDataError] = useState<string | null>(
    null
  );
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    null
  );
  const [clusterLabels, setClusterLabels] = useState<
    Record<number, ClusterLabelEntry>
  >({});
  const [manualSelectedCells, setManualSelectedCells] = useState<
    ManualSelectedCellCenter[]
  >([]);
  const [stacAnnotationDatetime, setStacAnnotationDatetime] = useState<
    string | null
  >(null);
  const [stacAnnotationItemId, setStacAnnotationItemId] = useState<
    string | null
  >(null);
  const [parcelVegPieRevision, setParcelVegPieRevision] = useState(0);
  const [manualEditPanelOpen, setManualEditPanelOpen] = useState(false);
  const [parcelMongoDetail, setParcelMongoDetail] =
    useState<ParcelMongoDetailOk | null>(null);
  const [parcelMongoLoading, setParcelMongoLoading] = useState(false);
  const [parcelMongoError, setParcelMongoError] = useState<string | null>(null);

  const bumpParcelVegPieRevision = useCallback(() => {
    setParcelVegPieRevision((n) => n + 1);
  }, []);

  const refreshClusterLabels = useCallback(async () => {
    try {
      const res = await fetch("/api/cluster-label");
      if (!res.ok) return;
      const j = (await res.json()) as { labels?: Record<string, ClusterLabelEntry> };
      const out: Record<number, ClusterLabelEntry> = {};
      for (const [k, v] of Object.entries(j.labels ?? {})) {
        const id = Number(k);
        if (Number.isFinite(id) && v && typeof v.vegCat === "number") {
          out[id] = {
            vegCat: v.vegCat,
            displayName:
              typeof v.displayName === "string" ? v.displayName : "",
          };
        }
      }
      setClusterLabels(out);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshClusterLabels();
  }, [refreshClusterLabels]);

  const loadClusterData = useCallback(async (opts?: { force?: boolean }) => {
    if (!opts?.force && clusterGeojson != null) return;
    setClusterDataLoading(true);
    setClusterDataError(null);
    try {
      const res = await fetch("/api/cluster-layer", { cache: "no-store" });
      if (!res.ok) throw new Error("cluster-layer HTTP " + res.status);
      const j = (await res.json()) as {
        ranking?: ClusterRankingEntry[];
        geojson?: FeatureCollection;
        error?: string;
      };
      if (j.error) throw new Error(String(j.error));
      setClusterRanking(j.ranking ?? []);
      setClusterGeojson(j.geojson ?? { type: "FeatureCollection", features: [] });
    } catch (e) {
      setClusterDataError(
        e instanceof Error ? e.message : "Erreur chargement clusters"
      );
    } finally {
      setClusterDataLoading(false);
    }
  }, [clusterGeojson]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/parcels-geojson", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const api = (await res.json()) as {
          ok?: boolean;
          error?: string;
          data?: FeatureCollection;
        };
        if (api.ok === false || !api.data) {
          throw new Error(api.error ?? "parcels_geojson_api_failed");
        }
        const json = api.data;
        if (cancelled) return;
        setData(json);
        const { min, max } = surfaceRange(json.features);
        setFilters(defaultFiltersFromMax(max));
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Erreur de chargement");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedParcel) setStacOverlay(null);
  }, [selectedParcel]);

  useEffect(() => {
    if (!selectedParcel) {
      setManualSelectedCells([]);
      setStacAnnotationDatetime(null);
      setStacAnnotationItemId(null);
      setManualEditPanelOpen(false);
      setVectorLayersOpacity(1);
    }
  }, [selectedParcel]);

  useLayoutEffect(() => {
    setParcelMongoDetail(null);
    setParcelMongoError(null);
  }, [selectedParcel]);

  useEffect(() => {
    const g = selectedParcel?.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
      setParcelMongoDetail(null);
      setParcelMongoError(null);
      setParcelMongoLoading(false);
      return;
    }
    const ac = new AbortController();
    const keyAtStart = parcelStableSelectionKey(selectedParcel);
    setParcelMongoLoading(true);
    setParcelMongoError(null);
    void (async () => {
      const props = selectedParcel?.properties as
        | Record<string, unknown>
        | undefined;
      let dagFeatureId = "";
      if (props) {
        if (
          typeof props.dag_feature_id === "string" &&
          props.dag_feature_id.trim()
        ) {
          dagFeatureId = props.dag_feature_id.trim();
        } else {
          const pid = props._id;
          if (typeof pid === "string" && pid.trim()) {
            dagFeatureId = pid.trim();
          }
        }
      }
      try {
        const pKm2 = parcelSurfaceKm2FromProps(props);
        const reqBody: Record<string, unknown> = { geometry: g, dagFeatureId };
        if (pKm2 != null) reqBody.parcelSurfaceKm2 = pKm2;
        if (stacAnnotationDatetime) reqBody.datetime = stacAnnotationDatetime;
        if (stacAnnotationItemId) reqBody.stacItemId = stacAnnotationItemId;
        const res = await fetch("/api/parcel-mongo-detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
          signal: ac.signal,
          cache: "no-store",
        });
        const j = (await res.json()) as ParcelMongoDetailResponse;
        if (ac.signal.aborted) return;
        if (parcelStableSelectionKey(selectedParcelRef.current) !== keyAtStart) {
          return;
        }
        if (j.ok) {
          setParcelMongoDetail(j);
          setParcelMongoError(null);
        } else {
          setParcelMongoDetail(null);
          setParcelMongoError(j.error ?? "mongo_parcel_failed");
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (!ac.signal.aborted) {
          if (parcelStableSelectionKey(selectedParcelRef.current) === keyAtStart) {
            setParcelMongoDetail(null);
            setParcelMongoError(
              e instanceof Error ? e.message : "Erreur chargement IA parcelle"
            );
          }
        }
      } finally {
        if (!ac.signal.aborted) setParcelMongoLoading(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [
    selectedParcel,
    stacAnnotationDatetime,
    stacAnnotationItemId,
    parcelVegPieRevision,
  ]);

  const surfaceBounds = useMemo(() => {
    if (!data) return { min: 0, max: 1 };
    return surfaceRange(data.features);
  }, [data]);

  const communes = useMemo(() => {
    if (!data) return [];
    return collectDistinctField(data.features, "commune");
  }, [data]);

  const productionTypes = useMemo(() => {
    if (!data) return [];
    return collectDistinctField(data.features, "production_type");
  }, [data]);

  const typeParcelles = useMemo(() => {
    if (!data) return [];
    return collectDistinctField(data.features, "type_parcelle");
  }, [data]);

  const layerFilter = useMemo(() => {
    if (!data) return undefined;
    const sr = surfaceRange(data.features);
    if (filtersMatchFullDataset(filters, sr)) return undefined;
    return buildLayerFilter(filters);
  }, [data, filters]);

  const filteredFeatureCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const f of data.features) {
      if (featureMatchesFilters(f, filters)) n += 1;
    }
    return n;
  }, [data, filters]);

  const resetFilters = useCallback(() => {
    setFilters(defaultFiltersFromMax(surfaceBounds.max));
  }, [surfaceBounds.max]);

  const value: ParcelAppState = {
    data,
    loadError,
    loading,
    filters,
    setFilters,
    resetFilters,
    layerFilter,
    filteredFeatureCount,
    communes,
    productionTypes,
    typeParcelles,
    surfaceBounds,
    activeDrawer,
    setActiveDrawer,
    selectedParcel,
    setSelectedParcel,
    stacOverlay,
    setStacOverlay,
    vectorLayersOpacity,
    setVectorLayersOpacity,
    clusterRanking,
    clusterGeojson,
    clusterDataLoading,
    clusterDataError,
    loadClusterData,
    selectedClusterId,
    setSelectedClusterId,
    clusterLabels,
    refreshClusterLabels,
    manualSelectedCells,
    setManualSelectedCells,
    stacAnnotationDatetime,
    setStacAnnotationDatetime,
    stacAnnotationItemId,
    setStacAnnotationItemId,
    parcelVegPieRevision,
    bumpParcelVegPieRevision,
    manualEditPanelOpen,
    setManualEditPanelOpen,
    parcelMongoDetail,
    parcelMongoLoading,
    parcelMongoError,
  };

  return (
    <ParcelAppContext.Provider value={value}>{children}</ParcelAppContext.Provider>
  );
}

export function useParcelApp() {
  const ctx = useContext(ParcelAppContext);
  if (!ctx) {
    throw new Error("useParcelApp doit etre utilise dans ParcelAppProvider");
  }
  return ctx;
}
