"use client";

import { useEffect, useRef, useState } from "react";

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function DataExportSettings() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleDownload() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/export-vectors-csv");
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        const code = err?.error;
        const msg =
          code === "classes_missing"
            ? "Fichier des classes (referentiel) introuvable sur le serveur."
            : code === "empty_csv"
              ? "Le CSV des vecteurs est vide."
              : res.status === 404
                ? "Fichier des vecteurs introuvable sur le serveur."
                : "Echec du telechargement.";
        window.alert(msg);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let filename = "DAG_16_07_2025_STAC_repartition.geojson";
      if (cd) {
        const m = /filename="?([^";\n]+)"?/i.exec(cd);
        if (m) filename = m[1].trim();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch {
      window.alert("Echec du telechargement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      className="pointer-events-auto fixed bottom-4 left-1 z-[70] flex flex-col items-start gap-2 sm:bottom-5"
    >
      {open ? (
        <div className="mb-1 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-emerald-900/15 bg-white p-3 text-emerald-950 shadow-xl">
          <p className="mb-3 text-xs leading-snug text-emerald-900/80">
            Genere un GeoJSON base sur{" "}
            <code className="rounded bg-emerald-100/80 px-1">DAG.16_07_2025.json</code> avec,
            pour chaque parcelle puis chaque date STAC, la repartition en pourcentages entiers
            des types de vecteurs (priorite manuel puis modele), ainsi que la date de
            telechargement et les metadonnees de version/precision du modele.
          </p>
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
            onClick={handleDownload}
          >
            {busy ? "Preparation..." : "Telecharger le GeoJSON"}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Telecharger les donnees"
        aria-expanded={open}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-600/40 bg-emerald-900/85 text-emerald-100 shadow-lg backdrop-blur-sm transition hover:bg-emerald-800/95 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
        onClick={() => setOpen((v) => !v)}
      >
        <DownloadIcon />
      </button>
    </div>
  );
}
