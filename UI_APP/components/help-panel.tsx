"use client";

interface HelpPanelProps {
  onStartIntroTutorial: () => void;
  onStartLabelingTutorial: () => void;
  onStartAiChartsTutorial: () => void;
  onStartParcelToolsTutorial: () => void;
  onStartFeedbackTutorial: () => void;
  onStartSettingsInsightsTutorial: () => void;
}

export function HelpPanel({
  onStartIntroTutorial,
  onStartLabelingTutorial,
  onStartAiChartsTutorial,
  onStartParcelToolsTutorial,
  onStartFeedbackTutorial,
  onStartSettingsInsightsTutorial,
}: HelpPanelProps) {
  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-emerald-50 text-emerald-950">
      <div className="border-b border-emerald-900/15 px-3 py-2.5">
        <h2 className="text-sm font-semibold">Aide interactive</h2>
        <p className="mt-1 text-xs text-emerald-800/85">
          Didacticiels guidés pour prendre en main l&apos;interface.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <article className="rounded-md border border-emerald-900/15 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-emerald-900">
            Présentation générale de l&apos;interface
          </h3>
          <p className="mt-1 text-xs text-emerald-800/85">
            Découvrir rapidement la carte et les onglets principaux, dont
            l&apos;onglet didacticiels.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={onStartIntroTutorial}
          >
            Lancer ce didacticiel
          </button>
        </article>

        <article className="rounded-md border border-emerald-900/15 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-emerald-900">
            Labelliser via les notifications
          </h3>
          <p className="mt-1 text-xs text-emerald-800/85">
            Comprendre le badge, ouvrir le Top 10, choisir une parcelle et
            appliquer une annotation manuelle.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={onStartLabelingTutorial}
          >
            Lancer ce didacticiel
          </button>
        </article>

        <article className="rounded-md border border-emerald-900/15 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-emerald-900">
            Comprendre l&apos;IA et les graphiques
          </h3>
          <p className="mt-1 text-xs text-emerald-800/85">
            Lire les surfaces par classe, l&apos;évolution temporelle et les barres de
            comparaison.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={onStartAiChartsTutorial}
          >
            Lancer ce didacticiel
          </button>
        </article>

        <article className="rounded-md border border-emerald-900/15 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-emerald-900">
            Comprendre les données d&apos;une parcelle
          </h3>
          <p className="mt-1 text-xs text-emerald-800/85">
            Lire la fiche parcelle et utiliser les styles d&apos;analyse satellite :
            Couleur, NDVI et Urban.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={onStartParcelToolsTutorial}
          >
            Lancer ce didacticiel
          </button>
        </article>

        <article className="rounded-md border border-emerald-900/15 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-emerald-900">
            Remonter une remarque aux développeurs
          </h3>
          <p className="mt-1 text-xs text-emerald-800/85">
            Apprendre à envoyer une remarque, une demande ou une modification via
            le formulaire Tickets.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={onStartFeedbackTutorial}
          >
            Lancer ce didacticiel
          </button>
        </article>

        <article className="rounded-md border border-emerald-900/15 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-emerald-900">
            Comprendre les insights du modele
          </h3>
          <p className="mt-1 text-xs text-emerald-800/85">
            Lecture du résumé du modèle, évolution, matrice de confusion et
            rapport, avec rappel de la mise à jour hebdomadaire le week-end.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={onStartSettingsInsightsTutorial}
          >
            Lancer ce didacticiel
          </button>
        </article>
      </div>
    </div>
  );
}
