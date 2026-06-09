"use client";

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

interface LeftRailProps {
  active: DrawerKey;
  onSelect: (key: DrawerKey) => void;
  labelingNotificationCount?: number;
  reviewNotificationCount?: number;
  showReviewTab?: boolean;
  showAdminShortcut?: boolean;
  onOpenAdmin?: () => void;
}

const btn =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-xl transition-colors";

export function LeftRail({
  active,
  onSelect,
  labelingNotificationCount = 0,
  reviewNotificationCount = 0,
  showReviewTab = true,
  showAdminShortcut = false,
  onOpenAdmin,
}: LeftRailProps) {
  return (
    <aside
      className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-emerald-900/15 bg-emerald-950 py-3 text-emerald-50"
      aria-label="Navigation principale"
    >
      <button
        type="button"
        className={`${btn} ${
          active === "map"
            ? "bg-emerald-700 ring-2 ring-emerald-400"
            : "hover:bg-emerald-800"
        }`}
        aria-label="Carte"
        title="Carte"
        onClick={() => onSelect("map")}
        data-tour="nav-map"
      >
        <span aria-hidden>🗺️</span>
      </button>
      <button
        type="button"
        className={`${btn} ${
          active === "data"
            ? "bg-emerald-700 ring-2 ring-emerald-400"
            : "hover:bg-emerald-800"
        }`}
        aria-label="Donnees et filtres"
        title="Donnees et filtres"
        onClick={() => onSelect("data")}
        data-tour="nav-data"
      >
        <span aria-hidden>📋</span>
      </button>
      <button
        type="button"
        className={`${btn} ${
          active === "charts"
            ? "bg-emerald-700 ring-2 ring-emerald-400"
            : "hover:bg-emerald-800"
        }`}
        aria-label="Graphiques"
        title="Graphiques"
        onClick={() => onSelect("charts")}
        data-tour="nav-charts"
      >
        <span aria-hidden>📈</span>
      </button>
      <button
        type="button"
        className={`${btn} ${
          active === "labeling"
            ? "bg-emerald-700 ring-2 ring-emerald-400"
            : "hover:bg-emerald-800"
        } relative`}
        aria-label="Priorites etiquetage"
        title="Parcelles a labelliser (Top 10)"
        onClick={() => onSelect("labeling")}
        data-tour="nav-labeling"
      >
        <span aria-hidden>🔔</span>
        {labelingNotificationCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-[18px] text-emerald-950 ring-2 ring-emerald-950">
            {labelingNotificationCount > 99 ? "99+" : labelingNotificationCount}
          </span>
        ) : null}
      </button>
      {showReviewTab ? (
        <button
          type="button"
          className={`${btn} ${
            active === "review"
              ? "bg-emerald-700 ring-2 ring-emerald-400"
              : "hover:bg-emerald-800"
          } relative`}
          aria-label="Validation etiqueteurs"
          title="Validation manuelle (check true/false)"
          onClick={() => onSelect("review")}
          data-tour="nav-review"
        >
          <span aria-hidden>✅</span>
          {reviewNotificationCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-sky-400 px-1 text-center text-[10px] font-bold leading-[18px] text-emerald-950 ring-2 ring-emerald-950">
              {reviewNotificationCount > 99 ? "99+" : reviewNotificationCount}
            </span>
          ) : null}
        </button>
      ) : null}
      <button
        type="button"
        className={`${btn} ${
          active === "help"
            ? "bg-emerald-700 ring-2 ring-emerald-400"
            : "hover:bg-emerald-800"
        }`}
        aria-label="Aide et didacticiels"
        title="Aide interactive"
        onClick={() => onSelect("help")}
        data-tour="nav-help"
      >
        <span aria-hidden>?</span>
      </button>
      <button
        type="button"
        className={`${btn} ${
          active === "settings"
            ? "bg-emerald-700 ring-2 ring-emerald-400"
            : "hover:bg-emerald-800"
        }`}
        aria-label="Paramètres et analyses du modèle"
        title="Paramètres"
        onClick={() => onSelect("settings")}
        data-tour="nav-settings"
      >
        <span aria-hidden>⚙️</span>
      </button>
      <button
        type="button"
        className={`${btn} ${
          active === "tickets"
            ? "bg-emerald-700 ring-2 ring-emerald-400"
            : "hover:bg-emerald-800"
        }`}
        aria-label="Tickets ameliorations"
        title="Tickets"
        onClick={() => onSelect("tickets")}
        data-tour="nav-tickets"
      >
        <span aria-hidden>🎫</span>
      </button>
      <div className="mt-auto">
        {showAdminShortcut ? (
          <button
            type="button"
            className={`${btn} opacity-90 hover:bg-emerald-800`}
            aria-label="Page administrateur"
            title="Administration"
            onClick={() => onOpenAdmin?.()}
          >
            <span aria-hidden>🛡️</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
