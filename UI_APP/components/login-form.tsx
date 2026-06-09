"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "admin" | "client";

type LoginFormProps = {
  expired: boolean;
};

export function LoginForm({ expired }: LoginFormProps) {
  const router = useRouter();
  const [role, setRole] = useState<Role>("client");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expired) return;
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }, [expired, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, code }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; role?: Role };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Connexion refusée.");
        return;
      }
      router.replace("/app?fresh=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07130e] px-4 py-10 text-emerald-50">
      <Image
        src="/background_login.jpg"
        alt="Fond agricole de la page de connexion"
        fill
        sizes="100vw"
        className="pointer-events-none object-cover blur-[2px]"
        priority
      />
      <div className="relative z-10 w-full max-w-5xl">
        <div className="-mt-8 mb-10 flex justify-center sm:-mt-10 sm:mb-12">
          <div className="relative h-36 w-36 overflow-hidden sm:h-44 sm:w-44">
            <Image
              src="/ARRPSAT%20GREEN%20logo.png"
              alt="ARRPSAT GREEN logo"
              fill
              sizes="176px"
              className="object-contain"
              priority
            />
          </div>
        </div>

        <section className="grid w-full overflow-hidden rounded-2xl border border-cyan-300/40 bg-[linear-gradient(145deg,rgba(6,22,16,0.9),rgba(5,18,14,0.82))] shadow-[0_30px_120px_rgba(0,0,0,0.55),0_0_80px_rgba(45,212,191,0.16)] backdrop-blur-md lg:grid-cols-[1.1fr_0.9fr]">
          <aside className="hidden border-r border-cyan-300/25 bg-[linear-gradient(180deg,rgba(16,185,129,0.2),rgba(6,95,70,0.18))] p-8 lg:block">
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
              ARRPSAT GREEN
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-emerald-50">
              Supervision Agricole par Satellite et IA de nouvelle génération
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-emerald-100/85">
              Plateforme de pilotage des parcelles, labels IA et analyses terrain.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-2 text-xs text-emerald-100">
              <span className="rounded-md border border-cyan-300/25 bg-cyan-400/10 px-3 py-2">
                Cartographie intelligente
              </span>
              <span className="rounded-md border border-cyan-300/25 bg-cyan-400/10 px-3 py-2">
                Analyse multiclasses
              </span>
              <span className="rounded-md border border-cyan-300/25 bg-cyan-400/10 px-3 py-2">
                Contrôle qualité labels
              </span>
              <span className="rounded-md border border-cyan-300/25 bg-cyan-400/10 px-3 py-2">
                Suivi opérations terrain
              </span>
            </div>
          </aside>

          <div className="bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.2),transparent_45%)] p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-emerald-50">Connexion sécurisée</h2>
            <p className="mt-1 text-sm text-emerald-200/90">
              Entrez votre code administrateur ou client pour accéder à la plateforme.
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div>
                <label className="mb-1 block text-sm text-emerald-100" htmlFor="role">
                  Type d&apos;accès
                </label>
                <select
                  id="role"
                  className="w-full rounded-md border border-cyan-300/35 bg-emerald-950/85 px-3 py-2 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/35"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  disabled={loading}
                >
                  <option value="client">Client</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-emerald-100" htmlFor="code">
                  Code {role === "admin" ? "administrateur" : "client"}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-emerald-200/90 transition hover:bg-emerald-900/70 hover:text-white"
                    aria-label={showCode ? "Masquer le code" : "Afficher le code"}
                    onClick={() => setShowCode((v) => !v)}
                    disabled={loading}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
                      <path
                        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  </button>
                  <input
                    id="code"
                    type={showCode ? "text" : "password"}
                    className="w-full rounded-md border border-cyan-300/35 bg-emerald-950/85 py-2 pl-10 pr-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/35"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Saisir le code"
                    autoComplete="off"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {error ? (
                <p className="rounded-md border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-md bg-[linear-gradient(90deg,#10b981,#06b6d4)] px-3 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_rgba(34,211,238,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
