"use client";

import { useEffect, useMemo, useState } from "react";

export type WalkthroughStep = {
  title: string;
  description: string;
  targetId?: string;
};

interface WalkthroughOverlayProps {
  open: boolean;
  tutorialTitle: string;
  steps: WalkthroughStep[];
  stepIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

type Box = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function WalkthroughOverlay({
  open,
  tutorialTitle,
  steps,
  stepIndex,
  onPrev,
  onNext,
  onClose,
}: WalkthroughOverlayProps) {
  const step = steps[stepIndex];
  const [targetBox, setTargetBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });

  useEffect(() => {
    if (!open || !step) return;
    const refresh = () => {
      setViewport({
        width: typeof window === "undefined" ? 1280 : window.innerWidth,
        height: typeof window === "undefined" ? 800 : window.innerHeight,
      });
      if (!step.targetId) {
        setTargetBox(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(
        `[data-tour="${step.targetId}"]`
      );
      if (!el) {
        setTargetBox(null);
        return;
      }
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setTargetBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    refresh();
    const intervalId = window.setInterval(refresh, 350);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [open, step]);

  const cardPos = useMemo(() => {
    if (!targetBox) {
      return { top: 88, left: 88 };
    }
    const cardWidth = 360;
    const margin = 12;
    const vw = viewport.width || 1280;
    const vh = viewport.height || 800;
    const preferBelow = targetBox.top + targetBox.height + 220 < vh;
    const top = preferBelow
      ? targetBox.top + targetBox.height + margin
      : targetBox.top - 220;
    const left = clamp(
      targetBox.left + targetBox.width / 2 - cardWidth / 2,
      margin,
      vw - cardWidth - margin
    );
    return { top: clamp(top, margin, vh - 220 - margin), left };
  }, [targetBox, viewport]);

  if (!open || !step) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[1200]">
      {targetBox ? (
        <div
          className="absolute rounded-md border-2 border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
          style={{
            top: targetBox.top - 6,
            left: targetBox.left - 6,
            width: targetBox.width + 12,
            height: targetBox.height + 12,
          }}
        />
      ) : null}

      <section
        className="pointer-events-auto absolute w-[360px] max-w-[calc(100vw-1.5rem)] rounded-lg border border-emerald-900/20 bg-white p-3 text-emerald-950 shadow-xl"
        style={{ top: cardPos.top, left: cardPos.left }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          {tutorialTitle}
        </p>
        <h3 className="mt-1 text-sm font-semibold">{step.title}</h3>
        <p className="mt-1 text-xs leading-snug text-emerald-800/90">
          {step.description}
        </p>
        {!targetBox ? (
          <p className="mt-2 text-[11px] text-amber-800">
            Zone non visible pour cette etape. Continue pour avancer.
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-emerald-800/80">
            Etape {stepIndex + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="rounded border border-emerald-800/25 bg-white px-2 py-1 text-xs font-medium hover:bg-emerald-50 disabled:opacity-50"
              onClick={onPrev}
              disabled={stepIndex === 0}
            >
              Précédent
            </button>
            <button
              type="button"
              className="rounded border border-emerald-800/25 bg-white px-2 py-1 text-xs font-medium hover:bg-emerald-50"
              onClick={onClose}
            >
              Quitter
            </button>
            <button
              type="button"
              className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600"
              onClick={onNext}
            >
              {stepIndex === steps.length - 1 ? "Terminer" : "Suivant"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
