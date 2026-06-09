"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { Feature } from "geojson";
import { useParcelApp } from "@/context/parcel-app-context";
import { ChartsPanel } from "@/components/charts-panel";
import { DataPanel } from "@/components/data-panel";
import { HelpPanel } from "@/components/help-panel";
import { LeftRail } from "@/components/left-rail";
import {
  ManualReviewPanel,
  type ManualReviewEntry,
} from "@/components/manual-review-panel";
import { ParcelActionPanel } from "@/components/parcel-action-panel";
import { ParcelDetailPanel } from "@/components/parcel-detail-panel";
import {
  LabelingPriorityPanel,
  type LabelingPriorityEntry,
} from "@/components/labeling-priority-panel";
import { ParcelManualEditPanel } from "@/components/parcel-manual-edit-panel";
import { DataExportSettings } from "@/components/data-export-settings";
import { SettingsPanel } from "@/components/settings-panel";
import { TicketsPanel } from "@/components/tickets-panel";
import {
  WalkthroughOverlay,
  type WalkthroughStep,
} from "@/components/walkthrough-overlay";

const ParcelMap = dynamic(() => import("@/components/parcel-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-emerald-50 text-emerald-900">
      Initialisation de la carte...
    </div>
  ),
});

type TutorialId =
  | "intro"
  | "labeling"
  | "charts"
  | "parcel-tools"
  | "feedback"
  | "settings-insights";

const LABELING_TUTORIAL_STEPS: WalkthroughStep[] = [
  {
    title: "Ouvrir les priorités de labellisation",
    description:
      "La cloche indique le nombre de parcelles à traiter. Clique-la pour ouvrir la liste priorisée.",
    targetId: "nav-labeling",
  },
  {
    title: "Lire le résumé",
    description:
      "Cette zone résume le volume total de parcelles encore en A labelliser.",
    targetId: "labeling-summary",
  },
  {
    title: "Choisir une parcelle du Top 10",
    description:
      "Clique la première ligne pour ouvrir la parcelle au plus fort volume de vecteurs.",
    targetId: "labeling-top-item-1",
  },
  {
    title: "Comprendre le diagnostic IA",
    description:
      "Le bloc IA montre la répartition des classes dans la parcelle (camembert + légendes).",
    targetId: "parcel-detail-ia",
  },
  {
    title: "Passer en annotation manuelle",
    description:
      "Clique ce bouton pour ouvrir l'éditeur manuel des mailles de la parcelle.",
    targetId: "parcel-open-manual-edit",
  },
  {
    title: "Sélectionner les vecteurs sur la carte",
    description:
      "Sur la carte, clique les mailles à corriger (ou Maj + rectangle) pour construire ta sélection.",
    targetId: "map-main",
  },
  {
    title: "Choisir la classe finale",
    description: "Sélectionne la classe de culture que tu veux appliquer.",
    targetId: "manual-edit-select-veg",
  },
  {
    title: "Appliquer la mise à jour",
    description:
      "Applique ensuite sur les mailles sélectionnées. Le classement Top 10 se mettra à jour.",
    targetId: "manual-edit-apply",
  },
  {
    title: "Validation humaine finale",
    description:
      "A la suite de votre labellisation, un humain se chargera de verifier les labels mentionnes pour eviter les erreurs et maximiser les resultats.",
    targetId: "nav-review",
  },
];

const INTRO_TUTORIAL_STEPS: WalkthroughStep[] = [
  {
    title: "Bienvenue sur ARRPSAT GREEN",
    description:
      "Cette visite présente l'interface générale et le rôle de chaque onglet.",
    targetId: "map-main",
  },
  {
    title: "Carte",
    description:
      "La carte est l'espace principal pour explorer les parcelles et ouvrir leur fiche.",
    targetId: "nav-map",
  },
  {
    title: "Recherche et filtres",
    description:
      "Cet onglet permet de filtrer les parcelles (commune, type de production, surface).",
    targetId: "nav-data",
  },
  {
    title: "Top priorités de labellisation",
    description:
      "La cloche affiche le nombre de parcelles à traiter et ouvre le Top 10 prioritaire.",
    targetId: "nav-labeling",
  },
  {
    title: "Graphiques IA",
    description:
      "L'onglet graphiques donne une vue agrégée des classes et de leur évolution.",
    targetId: "nav-charts",
  },
  {
    title: "Paramètres et insights",
    description:
      "Cet onglet présente les indicateurs du modèle et les analyses de performance.",
    targetId: "nav-settings",
  },
  {
    title: "Tickets",
    description:
      "Cet onglet permet de remonter une remarque, demande ou modification aux développeurs.",
    targetId: "nav-tickets",
  },
  {
    title: "Didacticiels",
    description:
      "L'onglet ? regroupe tous les parcours guidés pour accompagner les utilisateurs.",
    targetId: "nav-help",
  },
];

const CHARTS_TUTORIAL_STEPS: WalkthroughStep[] = [
  {
    title: "Ouvrir les graphiques IA",
    description: "Clique l'icône graphiques pour ouvrir la vue analytique plein écran.",
    targetId: "nav-charts",
  },
  {
    title: "Surfaces par classe",
    description:
      "Ce premier bloc montre la distribution globale des classes IA en surface.",
    targetId: "charts-surfaces",
  },
  {
    title: "Évolution temporelle",
    description:
      "La courbe par semestre aide à expliquer les tendances au client (hausse/baisse par classe).",
    targetId: "charts-evolution",
  },
  {
    title: "Comparaison par barres",
    description:
      "Les barres facilitent la comparaison des classes à un instant donné.",
    targetId: "charts-bars",
  },
];

const PARCEL_TOOLS_TUTORIAL_STEPS: WalkthroughStep[] = [
  {
    title: "Ouvrir la carte",
    description:
      "Commence sur la carte, puis clique une parcelle pour afficher sa fiche à droite.",
    targetId: "nav-map",
  },
  {
    title: "Comprendre la fiche parcelle",
    description:
      "Ce bloc présente les informations clés de la parcelle sélectionnée (commune, surface, identifiants, etc.).",
    targetId: "parcel-data-list",
  },
  {
    title: "Analyser l'image satellite",
    description:
      "Dans ce bloc, tu peux choisir la scène STAC la plus pertinente pour l'analyse.",
    targetId: "parcel-detail-stac",
  },
  {
    title: "Utiliser les styles d'analyse",
    description:
      "Bascule entre Couleur, NDVI et Urban pour comparer visuellement les zones de végétation et d'occupation.",
    targetId: "parcel-style-tools",
  },
  {
    title: "Lire le diagnostic IA",
    description:
      "Le camembert et la légende montrent la répartition des classes IA dans la parcelle.",
    targetId: "parcel-detail-ia",
  },
];

const FEEDBACK_TUTORIAL_STEPS: WalkthroughStep[] = [
  {
    title: "Ouvrir l'onglet Tickets",
    description:
      "Clique l'icône Ticket dans la barre de gauche pour accéder au formulaire de remontée.",
    targetId: "nav-tickets",
  },
  {
    title: "Choisir le bon type de demande",
    description:
      "Précise s'il s'agit d'une remarque, d'une demande d'évolution ou d'une modification.",
    targetId: "tickets-form",
  },
  {
    title: "Décrire le besoin clairement",
    description:
      "Ajoute le contexte, ce que tu observes, le résultat attendu et, si possible, un exemple concret.",
    targetId: "tickets-form",
  },
  {
    title: "Envoyer au bon moment",
    description:
      "Soumets le formulaire. L'équipe de développement pourra prioriser et revenir vers toi.",
    targetId: "tickets-form",
  },
];

const SETTINGS_INSIGHTS_TUTORIAL_STEPS: WalkthroughStep[] = [
  {
    title: "Ouvrir l'onglet Parametres",
    description:
      "Clique l'icône Parametres pour ouvrir la page des insights du modèle.",
    targetId: "nav-settings",
  },
  {
    title: "Comprendre le resume du modele",
    description:
      "Ce bloc synthétise les indicateurs clés (exactitude, F1 macro, version et points de grille).",
    targetId: "settings-model-summary",
  },
  {
    title: "Frequence de mise a jour",
    description:
      "Les insights sont mis à jour une fois par semaine, pendant le week-end.",
    targetId: "settings-weekly-update",
  },
  {
    title: "Suivre l'evolution des performances",
    description:
      "Le graphe d'évolution montre la tendance de l'exactitude entre les versions.",
    targetId: "settings-accuracy-evolution",
  },
  {
    title: "Lire la matrice de confusion",
    description:
      "Ce visuel aide à identifier les classes que le modèle confond le plus.",
    targetId: "settings-confusion-matrix",
  },
  {
    title: "Verifier le rapport de classification",
    description:
      "Le tableau détaille précision, rappel, F1 et effectif par classe.",
    targetId: "settings-classification-report",
  },
  {
    title: "Consulter le referentiel des classes",
    description:
      "Cette section liste les classes métiers utilisées pour l'interprétation.",
    targetId: "settings-classes-reference",
  },
];

type AppRole = "admin" | "client";

interface AppShellProps {
  userRole: AppRole;
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export function AppShell({ userRole }: AppShellProps) {
  const {
    data,
    loading,
    loadError,
    layerFilter,
    activeDrawer,
    setActiveDrawer,
    selectedParcel,
    setSelectedParcel,
    manualEditPanelOpen,
    setManualEditPanelOpen,
    parcelVegPieRevision,
    bumpParcelVegPieRevision,
  } = useParcelApp();
  const [labelingLoading, setLabelingLoading] = useState(false);
  const [labelingError, setLabelingError] = useState<string | null>(null);
  const [labelingTotalParcels, setLabelingTotalParcels] = useState(0);
  const [labelingTop10, setLabelingTop10] = useState<
    Array<{ dagFeatureId: string; vectors: number }>
  >([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewPendingParcels, setReviewPendingParcels] = useState(0);
  const [reviewRows, setReviewRows] = useState<
    Array<{
      dagFeatureId: string;
      pendingCells: number;
      checkedCells: number;
      latestUpdateAt: string | null;
    }>
  >([]);
  const [tutorialId, setTutorialId] = useState<TutorialId | null>(null);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const canAccessManualReview = userRole === "admin";

  const loadLabelingPriority = useCallback(async () => {
    setLabelingLoading(true);
    setLabelingError(null);
    try {
      const res = await fetch("/api/parcel-labeling-priority", {
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        totalParcels?: number;
        top10?: Array<{ dagFeatureId?: unknown; vectors?: unknown }>;
      };
      if (!res.ok || j.ok === false) {
        setLabelingError(j.error ?? "Erreur chargement priorites");
        return;
      }
      setLabelingTotalParcels(
        typeof j.totalParcels === "number" && Number.isFinite(j.totalParcels)
          ? j.totalParcels
          : 0
      );
      const rows = (j.top10 ?? []).map((x) => ({
        dagFeatureId: String(x.dagFeatureId ?? ""),
        vectors:
          typeof x.vectors === "number" && Number.isFinite(x.vectors) ? x.vectors : 0,
      }));
      setLabelingTop10(rows.filter((r) => r.dagFeatureId !== ""));
    } catch (e) {
      setLabelingError(e instanceof Error ? e.message : "Erreur chargement priorites");
    } finally {
      setLabelingLoading(false);
    }
  }, []);

  const loadManualReview = useCallback(async () => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await fetch("/api/manual-label-review", { cache: "no-store" });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        pendingParcels?: number;
        rows?: Array<{
          dagFeatureId?: unknown;
          pendingCells?: unknown;
          checkedCells?: unknown;
          latestUpdateAt?: unknown;
        }>;
      };
      if (!res.ok || j.ok === false) {
        setReviewError(j.error ?? "Erreur chargement validation");
        return;
      }
      setReviewPendingParcels(
        typeof j.pendingParcels === "number" && Number.isFinite(j.pendingParcels)
          ? j.pendingParcels
          : 0
      );
      const rows = (j.rows ?? []).map((x) => ({
        dagFeatureId: String(x.dagFeatureId ?? ""),
        pendingCells:
          typeof x.pendingCells === "number" && Number.isFinite(x.pendingCells)
            ? x.pendingCells
            : 0,
        checkedCells:
          typeof x.checkedCells === "number" && Number.isFinite(x.checkedCells)
            ? x.checkedCells
            : 0,
        latestUpdateAt:
          typeof x.latestUpdateAt === "string" && x.latestUpdateAt.trim() !== ""
            ? x.latestUpdateAt
            : null,
      }));
      setReviewRows(rows.filter((r) => r.dagFeatureId !== ""));
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Erreur chargement validation");
    } finally {
      setReviewLoading(false);
    }
  }, []);

  const setManualCheck = useCallback(
    async (dagFeatureId: string, check: boolean): Promise<boolean> => {
      try {
        const res = await fetch("/api/manual-label-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dagFeatureId, check }),
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          setReviewError(j.error ?? "Erreur mise a jour validation");
          return false;
        }
        await Promise.all([loadManualReview(), loadLabelingPriority()]);
        bumpParcelVegPieRevision();
        return true;
      } catch (e) {
        setReviewError(e instanceof Error ? e.message : "Erreur reseau validation");
        return false;
      }
    },
    [bumpParcelVegPieRevision, loadLabelingPriority, loadManualReview]
  );

  useEffect(() => {
    void loadLabelingPriority();
  }, [loadLabelingPriority, parcelVegPieRevision]);

  useEffect(() => {
    if (!canAccessManualReview) return;
    void loadManualReview();
  }, [canAccessManualReview, loadManualReview, parcelVegPieRevision]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadLabelingPriority();
    }, 30000);
    return () => window.clearInterval(id);
  }, [loadLabelingPriority]);

  useEffect(() => {
    if (!canAccessManualReview) return;
    const id = window.setInterval(() => {
      void loadManualReview();
    }, 30000);
    return () => window.clearInterval(id);
  }, [canAccessManualReview, loadManualReview]);

  useEffect(() => {
    let alive = true;
    const forceLogin = () => {
      window.location.href = "/login";
    };
    const forceLoginAfterRefresh = () => {
      window.location.replace("/login?expired=1");
    };
    const isReloadNavigation = () => {
      const navEntry = window.performance
        .getEntriesByType("navigation")
        .at(0) as PerformanceNavigationTiming | undefined;
      if (navEntry?.type === "reload") return true;
      return window.performance.navigation?.type === 1;
    };

    if (isReloadNavigation()) {
      void fetch("/api/auth/logout", { method: "POST" }).finally(forceLoginAfterRefresh);
      return () => {
        alive = false;
      };
    }

    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { authenticated?: boolean };
        if (alive && j.authenticated !== true) {
          forceLogin();
        }
      } catch {
        return;
      }
    };
    void checkSession();
    const onPageShow = (evt: PageTransitionEvent) => {
      if (evt.persisted) {
        void checkSession();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      alive = false;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;

    const forceLogin = () => {
      window.location.href = "/login";
    };

    const resetInactivityTimer = () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        void fetch("/api/auth/logout", { method: "POST" }).finally(forceLogin);
      }, INACTIVITY_TIMEOUT_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];
    for (const evt of activityEvents) {
      window.addEventListener(evt, resetInactivityTimer, { passive: true });
    }
    resetInactivityTimer();

    return () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      for (const evt of activityEvents) {
        window.removeEventListener(evt, resetInactivityTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (!canAccessManualReview && activeDrawer === "review") {
      setActiveDrawer("map");
    }
  }, [activeDrawer, canAccessManualReview, setActiveDrawer]);

  const parcelByDagId = useMemo(() => {
    const out = new Map<string, Feature>();
    const feats = data?.features ?? [];
    for (const f of feats) {
      const p = f.properties as Record<string, unknown> | null | undefined;
      const k1 = typeof p?._id === "string" ? p._id.trim() : "";
      const k2 = typeof p?.dag_feature_id === "string" ? p.dag_feature_id.trim() : "";
      if (k1 !== "" && !out.has(k1)) out.set(k1, f);
      if (k2 !== "" && !out.has(k2)) out.set(k2, f);
    }
    return out;
  }, [data]);

  const labelingTop10Ui = useMemo<LabelingPriorityEntry[]>(() => {
    return labelingTop10.map((r) => {
      const f = parcelByDagId.get(r.dagFeatureId) ?? null;
      const p = f?.properties as Record<string, unknown> | null | undefined;
      const commune = typeof p?.commune === "string" ? p.commune : "";
      const lotRaw = p?.num_lot;
      const lot = lotRaw == null ? "" : String(lotRaw);
      return {
        dagFeatureId: r.dagFeatureId,
        vectors: r.vectors,
        commune,
        lot,
        feature: f,
      };
    });
  }, [labelingTop10, parcelByDagId]);

  const reviewRowsUi = useMemo<ManualReviewEntry[]>(() => {
    return reviewRows.map((r) => {
      const f = parcelByDagId.get(r.dagFeatureId) ?? null;
      const p = f?.properties as Record<string, unknown> | null | undefined;
      const commune = typeof p?.commune === "string" ? p.commune : "";
      const lotRaw = p?.num_lot;
      const lot = lotRaw == null ? "" : String(lotRaw);
      return {
        dagFeatureId: r.dagFeatureId,
        pendingCells: r.pendingCells,
        checkedCells: r.checkedCells,
        latestUpdateAt: r.latestUpdateAt,
        commune,
        lot,
        feature: f,
      };
    });
  }, [reviewRows, parcelByDagId]);

  const featureDagId = useCallback((f: Feature | null): string => {
    if (!f) return "";
    const p = f.properties as Record<string, unknown> | null | undefined;
    const id1 = typeof p?._id === "string" ? p._id.trim() : "";
    if (id1) return id1;
    const id2 = typeof p?.dag_feature_id === "string" ? p.dag_feature_id.trim() : "";
    return id2;
  }, []);

  const reviewNavFeatures = useMemo(
    () => reviewRowsUi.map((r) => r.feature).filter((f): f is Feature => f != null),
    [reviewRowsUi]
  );

  const goToNextReviewParcel = useCallback(() => {
    if (reviewNavFeatures.length === 0) return;
    const currentId = featureDagId(selectedParcel);
    const idx = reviewNavFeatures.findIndex(
      (f) => featureDagId(f) === currentId && currentId !== ""
    );
    if (idx < 0) {
      setSelectedParcel(reviewNavFeatures[0]!);
      return;
    }
    const nextIdx = Math.min(reviewNavFeatures.length - 1, idx + 1);
    setSelectedParcel(reviewNavFeatures[nextIdx]!);
  }, [featureDagId, reviewNavFeatures, selectedParcel, setSelectedParcel]);

  const goToPrevReviewParcel = useCallback(() => {
    if (reviewNavFeatures.length === 0) return;
    const currentId = featureDagId(selectedParcel);
    const idx = reviewNavFeatures.findIndex(
      (f) => featureDagId(f) === currentId && currentId !== ""
    );
    if (idx < 0) {
      setSelectedParcel(reviewNavFeatures[0]!);
      return;
    }
    const prevIdx = Math.max(0, idx - 1);
    setSelectedParcel(reviewNavFeatures[prevIdx]!);
  }, [featureDagId, reviewNavFeatures, selectedParcel, setSelectedParcel]);

  const activeTutorialSteps = useMemo(() => {
    if (tutorialId === "intro") return INTRO_TUTORIAL_STEPS;
    if (tutorialId === "labeling") return LABELING_TUTORIAL_STEPS;
    if (tutorialId === "charts") return CHARTS_TUTORIAL_STEPS;
    if (tutorialId === "parcel-tools") return PARCEL_TOOLS_TUTORIAL_STEPS;
    if (tutorialId === "feedback") return FEEDBACK_TUTORIAL_STEPS;
    if (tutorialId === "settings-insights")
      return SETTINGS_INSIGHTS_TUTORIAL_STEPS;
    return [];
  }, [tutorialId]);

  const startIntroTutorial = useCallback(() => {
    setTutorialId("intro");
    setTutorialStepIndex(0);
    setActiveDrawer("map");
    setManualEditPanelOpen(false);
  }, [setActiveDrawer, setManualEditPanelOpen]);

  const startLabelingTutorial = useCallback(() => {
    setTutorialId("labeling");
    setTutorialStepIndex(0);
    setActiveDrawer("labeling");
    setManualEditPanelOpen(false);
  }, [setActiveDrawer, setManualEditPanelOpen]);

  const startChartsTutorial = useCallback(() => {
    setTutorialId("charts");
    setTutorialStepIndex(0);
    setActiveDrawer("charts");
    setManualEditPanelOpen(false);
  }, [setActiveDrawer, setManualEditPanelOpen]);

  const startParcelToolsTutorial = useCallback(() => {
    setTutorialId("parcel-tools");
    setTutorialStepIndex(0);
    setActiveDrawer("map");
    setManualEditPanelOpen(false);
  }, [setActiveDrawer, setManualEditPanelOpen]);

  const startFeedbackTutorial = useCallback(() => {
    setTutorialId("feedback");
    setTutorialStepIndex(0);
    setActiveDrawer("tickets");
    setManualEditPanelOpen(false);
  }, [setActiveDrawer, setManualEditPanelOpen]);

  const startSettingsInsightsTutorial = useCallback(() => {
    setTutorialId("settings-insights");
    setTutorialStepIndex(0);
    setActiveDrawer("settings");
    setManualEditPanelOpen(false);
  }, [setActiveDrawer, setManualEditPanelOpen]);

  const stopTutorial = useCallback(() => {
    setTutorialId(null);
    setTutorialStepIndex(0);
  }, []);

  const stepToTutorialTarget = useCallback(
    (id: TutorialId, idx: number) => {
      if (id === "labeling") {
        if (idx <= 2) setActiveDrawer("labeling");
        if (idx >= 3) setActiveDrawer("map");
        if (idx >= 5) setManualEditPanelOpen(true);
        if (idx >= 3 && selectedParcel == null) {
          const first =
            labelingTop10Ui.find((r) => r.feature != null)?.feature ??
            data?.features?.[0] ??
            null;
          if (first) setSelectedParcel(first);
        }
        if (idx >= 8 && canAccessManualReview) {
          setManualEditPanelOpen(false);
          setActiveDrawer("review");
        }
      }
      if (id === "intro") {
        setActiveDrawer("map");
        setManualEditPanelOpen(false);
      }
      if (id === "charts") {
        setActiveDrawer("charts");
        setManualEditPanelOpen(false);
      }
      if (id === "parcel-tools") {
        setActiveDrawer("map");
        setManualEditPanelOpen(false);
        if (selectedParcel == null) {
          const first = data?.features?.[0] ?? null;
          if (first) setSelectedParcel(first);
        }
      }
      if (id === "feedback") {
        setActiveDrawer("tickets");
        setManualEditPanelOpen(false);
      }
      if (id === "settings-insights") {
        setActiveDrawer("settings");
        setManualEditPanelOpen(false);
      }
    },
    [
      data?.features,
      labelingTop10Ui,
      selectedParcel,
      setActiveDrawer,
      canAccessManualReview,
      setManualEditPanelOpen,
      setSelectedParcel,
    ]
  );

  useEffect(() => {
    if (!tutorialId) return;
    stepToTutorialTarget(tutorialId, tutorialStepIndex);
  }, [tutorialId, tutorialStepIndex, stepToTutorialTarget]);

  const showEditPanel = manualEditPanelOpen;
  const showDataPanel = activeDrawer === "data" && !manualEditPanelOpen;
  const showChartsPanel = activeDrawer === "charts" && !manualEditPanelOpen;
  const showLabelingPanel = activeDrawer === "labeling" && !manualEditPanelOpen;
  const showReviewPanel =
    canAccessManualReview && activeDrawer === "review" && !manualEditPanelOpen;
  const showHelpPanel = activeDrawer === "help" && !manualEditPanelOpen;
  const showSettingsPanel = activeDrawer === "settings" && !manualEditPanelOpen;
  const showTicketsPanel = activeDrawer === "tickets" && !manualEditPanelOpen;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-emerald-950 text-emerald-50">
      <LeftRail
        active={activeDrawer}
        labelingNotificationCount={labelingTotalParcels}
        reviewNotificationCount={reviewPendingParcels}
        showReviewTab={canAccessManualReview}
        showAdminShortcut={canAccessManualReview}
        onOpenAdmin={() => {
          window.location.assign("/admin");
        }}
        onSelect={(key) => {
          if (key === "satellite") return;
          if (key === "review" && !canAccessManualReview) return;
          setManualEditPanelOpen(false);
          setActiveDrawer(key);
        }}
      />

      {showDataPanel ? (
        <div
          className="z-20 flex w-full max-w-sm shrink-0 flex-col overflow-hidden border-r border-emerald-900/30 bg-emerald-50 shadow-xl sm:w-80"
          role="dialog"
          aria-label="Panneau donnees"
        >
          <DataPanel />
        </div>
      ) : null}

      {showChartsPanel ? (
        <div
          className="pointer-events-auto fixed bottom-0 left-14 right-0 top-0 z-[100] flex flex-col bg-emerald-50 text-emerald-950 shadow-[0_0_48px_rgba(0,0,0,0.28)]"
          role="dialog"
          aria-modal="true"
          aria-label="Graphiques plein ecran"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-900/20 bg-emerald-100/95 px-4 py-3">
            <h2 className="text-lg font-semibold text-emerald-950">
              Graphiques
            </h2>
            <button
              type="button"
              className="rounded-md border border-emerald-800/30 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-50"
              onClick={() => setActiveDrawer("map")}
            >
              Fermer
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChartsPanel />
          </div>
        </div>
      ) : null}

      {showLabelingPanel ? (
        <div
          className="z-20 flex w-full max-w-sm shrink-0 flex-col overflow-hidden border-r border-emerald-900/30 bg-emerald-50 shadow-xl sm:w-80"
          role="dialog"
          aria-label="Priorites etiquetage"
        >
          <LabelingPriorityPanel
            loading={labelingLoading}
            error={labelingError}
            totalParcels={labelingTotalParcels}
            top10={labelingTop10Ui}
            onRefresh={() => {
              void loadLabelingPriority();
            }}
            onOpenParcel={(f) => {
              setSelectedParcel(f);
              setActiveDrawer("map");
            }}
          />
        </div>
      ) : null}

      {showReviewPanel ? (
        <div
          className="z-20 flex w-full max-w-sm shrink-0 flex-col overflow-hidden border-r border-emerald-900/30 bg-emerald-50 shadow-xl sm:w-80"
          role="dialog"
          aria-label="Validation etiqueteurs"
        >
          <ManualReviewPanel
            loading={reviewLoading}
            error={reviewError}
            pendingParcels={reviewPendingParcels}
            rows={reviewRowsUi}
            onRefresh={() => {
              void loadManualReview();
            }}
            onOpenParcel={(f) => {
              setSelectedParcel(f);
            }}
          />
        </div>
      ) : null}

      {showHelpPanel ? (
        <div
          className="z-20 flex w-full max-w-sm shrink-0 flex-col overflow-hidden border-r border-emerald-900/30 bg-emerald-50 shadow-xl sm:w-80"
          role="dialog"
          aria-label="Aide interactive"
        >
          <HelpPanel
            onStartIntroTutorial={startIntroTutorial}
            onStartLabelingTutorial={startLabelingTutorial}
            onStartAiChartsTutorial={startChartsTutorial}
            onStartParcelToolsTutorial={startParcelToolsTutorial}
            onStartFeedbackTutorial={startFeedbackTutorial}
            onStartSettingsInsightsTutorial={startSettingsInsightsTutorial}
          />
        </div>
      ) : null}

      {showSettingsPanel ? (
        <div
          className="pointer-events-auto fixed bottom-0 left-14 right-0 top-0 z-[100] flex flex-col bg-emerald-50 text-emerald-950 shadow-[0_0_48px_rgba(0,0,0,0.28)]"
          role="dialog"
          aria-modal="true"
          aria-label="Paramètres et analyses du modèle"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-900/20 bg-emerald-100/95 px-4 py-3">
            <h2 className="text-lg font-semibold text-emerald-950">
              Paramètres et analyses du modèle
            </h2>
            <button
              type="button"
              className="rounded-md border border-emerald-800/30 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-50"
              onClick={() => setActiveDrawer("map")}
            >
              Fermer
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SettingsPanel />
          </div>
        </div>
      ) : null}

      {showTicketsPanel ? (
        <div
          className="pointer-events-auto fixed bottom-0 left-14 right-0 top-0 z-[100] flex flex-col bg-emerald-50 text-emerald-950 shadow-[0_0_48px_rgba(0,0,0,0.28)]"
          role="dialog"
          aria-modal="true"
          aria-label="Tickets ameliorations"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-900/20 bg-emerald-100/95 px-4 py-3">
            <h2 className="text-lg font-semibold text-emerald-950">
              Tickets ameliorations
            </h2>
            <button
              type="button"
              className="rounded-md border border-emerald-800/30 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-50"
              onClick={() => setActiveDrawer("map")}
            >
              Fermer
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            <TicketsPanel />
          </div>
        </div>
      ) : null}

      {showEditPanel ? (
        <div
          className="z-20 flex w-full max-w-sm shrink-0 flex-col overflow-hidden border-r border-emerald-900/30 bg-emerald-50 shadow-xl sm:w-80"
          role="dialog"
          aria-label="Annotation manuelle parcelle"
        >
          <ParcelManualEditPanel />
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-emerald-900/40 bg-emerald-900 px-4 py-2">
          <div className="relative h-10 w-10 overflow-hidden rounded-md border border-emerald-500/40 bg-white/95">
            <Image
              src="/ARRPSAT%20GREEN%20logo.png"
              alt="ARRPSAT GREEN logo"
              fill
              sizes="40px"
              className="object-contain p-0.5"
              priority
            />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-emerald-50">
              ARRPSAT GREEN
            </h1>
            <p className="text-xs text-emerald-300/90">
              Visualisation des parcelles (donnees locales)
            </p>
          </div>
        </header>

        <main className="relative min-h-0 min-w-0 flex-1">
          <div className="absolute inset-0" data-tour="map-main">
            {loadError ? (
              <div className="flex h-full items-center justify-center bg-red-950/30 p-6 text-center text-red-100">
                Impossible de charger les parcelles : {loadError}
              </div>
            ) : loading ? (
              <div className="flex h-full items-center justify-center bg-emerald-50 text-emerald-900">
                Chargement des donnees...
              </div>
            ) : (
              <ParcelMap data={data} layerFilter={layerFilter} />
            )}
          </div>

          {!loadError && !loading ? <DataExportSettings /> : null}

          {selectedParcel ? (
            <aside
              className={`pointer-events-none absolute right-3 z-20 flex w-[calc(100%-1.5rem)] max-w-sm flex-col sm:right-4 sm:w-80 ${
                activeDrawer === "review"
                  ? "top-3 sm:top-4"
                  : "bottom-3 top-3 sm:bottom-4 sm:top-4"
              }`}
              role="dialog"
              aria-label={
                activeDrawer === "review" ? "Actions parcelle" : "Fiche parcelle"
              }
            >
              <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-emerald-900/30 bg-white shadow-lg">
                {activeDrawer === "review" && canAccessManualReview ? (
                  <ParcelActionPanel
                    feature={selectedParcel}
                    onClose={() => setSelectedParcel(null)}
                    onSetCheck={async (dagFeatureId, check) => {
                      return await setManualCheck(dagFeatureId, check);
                    }}
                    onNextParcel={goToNextReviewParcel}
                    onPrevParcel={goToPrevReviewParcel}
                  />
                ) : (
                  <ParcelDetailPanel
                    feature={selectedParcel}
                    onClose={() => setSelectedParcel(null)}
                  />
                )}
              </div>
            </aside>
          ) : null}
        </main>
      </div>
      <WalkthroughOverlay
        open={tutorialId != null}
        tutorialTitle={
          tutorialId === "intro"
            ? "Didacticiel de présentation"
            : tutorialId === "labeling"
            ? "Didacticiel de labellisation"
            : tutorialId === "charts"
              ? "Didacticiel des graphiques IA"
              : tutorialId === "parcel-tools"
                ? "Didacticiel fiche parcelle et styles"
              : tutorialId === "feedback"
                ? "Didacticiel de remontée aux développeurs"
              : tutorialId === "settings-insights"
                ? "Didacticiel insights du modèle"
              : ""
        }
        steps={activeTutorialSteps}
        stepIndex={tutorialStepIndex}
        onPrev={() => {
          setTutorialStepIndex((s) => Math.max(0, s - 1));
        }}
        onNext={() => {
          setTutorialStepIndex((s) => {
            const next = s + 1;
            if (next >= activeTutorialSteps.length) {
              stopTutorial();
              return s;
            }
            return next;
          });
        }}
        onClose={stopTutorial}
      />
    </div>
  );
}
