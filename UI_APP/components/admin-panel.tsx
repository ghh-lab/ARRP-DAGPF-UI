"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "admin" | "client";

type CodeRow = {
  id: string;
  role: Role;
  name: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

type StatsResponse = {
  summary: {
    todayTotal: number;
    todaySuccess: number;
    todayFailed: number;
    blockedIpsCount: number;
  };
  daily: Array<{
    day: string;
    total: number;
    success: number;
    failed: number;
    uniqueIps: number;
  }>;
  recentLogs: Array<{
    ip: string;
    role: Role | "unknown";
    success: boolean;
    reason: string;
    createdAt: string;
  }>;
};

type Editable = {
  id: string;
  role: Role;
  name: string;
  code: string;
  isActive: boolean;
  expiresAt: string;
};

function toInputDateTimeValue(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(d.getFullYear()) +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

export function AdminPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<Role>("client");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");

  const [drafts, setDrafts] = useState<Record<string, Editable>>({});

  const sortedCodes = useMemo(
    () => [...codes].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    [codes]
  );

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [codesRes, statsRes] = await Promise.all([
        fetch("/api/admin/auth/codes", { cache: "no-store" }),
        fetch("/api/admin/auth/stats", { cache: "no-store" }),
      ]);
      if (codesRes.status === 403 || statsRes.status === 403) {
        router.replace("/login");
        return;
      }
      const codesJson = (await codesRes.json()) as {
        ok?: boolean;
        error?: string;
        rows?: CodeRow[];
      };
      const statsJson = (await statsRes.json()) as {
        ok?: boolean;
        error?: string;
        summary?: StatsResponse["summary"];
        daily?: StatsResponse["daily"];
        recentLogs?: StatsResponse["recentLogs"];
      };
      if (!codesRes.ok || !codesJson.ok) {
        setError(codesJson.error ?? "Impossible de charger les codes.");
        return;
      }
      if (!statsRes.ok || !statsJson.ok) {
        setError(statsJson.error ?? "Impossible de charger les stats.");
        return;
      }
      const rows = codesJson.rows ?? [];
      setCodes(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((r) => [
            r.id,
            {
              id: r.id,
              role: r.role,
              name: r.name,
              code: "",
              isActive: r.isActive,
              expiresAt: toInputDateTimeValue(r.expiresAt),
            } satisfies Editable,
          ])
        )
      );
      setStats({
        summary: statsJson.summary ?? {
          todayTotal: 0,
          todaySuccess: 0,
          todayFailed: 0,
          blockedIpsCount: 0,
        },
        daily: statsJson.daily ?? [],
        recentLogs: statsJson.recentLogs ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function setDraft(id: string, patch: Partial<Editable>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { id, role: "client", name: "", code: "", isActive: true, expiresAt: "" }), ...patch },
    }));
  }

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newName.trim() === "" || newCode.trim() === "") {
      setError("Nom et code obligatoires.");
      return;
    }
    setSavingId("new");
    try {
      const res = await fetch("/api/admin/auth/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: newRole,
          name: newName.trim(),
          code: newCode.trim(),
          expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Creation impossible.");
        return;
      }
      setNewName("");
      setNewCode("");
      setNewExpiresAt("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur creation code.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveRow(rowId: string) {
    const draft = drafts[rowId];
    if (!draft) return;
    setSavingId(rowId);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth/codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          role: draft.role,
          name: draft.name.trim(),
          code: draft.code.trim() === "" ? undefined : draft.code.trim(),
          isActive: draft.isActive,
          expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Mise a jour impossible.");
        return;
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur mise a jour code.");
    } finally {
      setSavingId(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  if (loading) {
    return <div className="p-6 text-emerald-100">Chargement de la page administrateur...</div>;
  }

  return (
    <main className="min-h-screen bg-emerald-950 px-4 py-6 text-emerald-50 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex items-center justify-between rounded-lg border border-emerald-800 bg-emerald-900/60 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Administration des acces</h1>
            <p className="text-sm text-emerald-200">
              Gestion des codes, expiration, connexions IP et activite journaliere.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-emerald-500 px-3 py-1.5 text-sm hover:bg-emerald-800"
              onClick={() => router.push("/app")}
            >
              Ouvrir l application
            </button>
            <button
              type="button"
              className="rounded-md border border-emerald-500 px-3 py-1.5 text-sm hover:bg-emerald-800"
              onClick={logout}
            >
              Se deconnecter
            </button>
          </div>
        </header>

        {error ? <p className="rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        <section className="rounded-lg border border-emerald-800 bg-emerald-900/50 p-4">
          <h2 className="text-base font-semibold">Creer un code</h2>
          <form className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5" onSubmit={createCode}>
            <select
              className="rounded-md border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              <option value="client">Client</option>
              <option value="admin">Administrateur</option>
            </select>
            <input
              className="rounded-md border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom attribue (ex: Chef projet)"
              required
            />
            <input
              className="rounded-md border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Code de connexion"
              required
            />
            <input
              type="datetime-local"
              className="rounded-md border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm"
              value={newExpiresAt}
              onChange={(e) => setNewExpiresAt(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              disabled={savingId === "new"}
            >
              {savingId === "new" ? "Creation..." : "Ajouter"}
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-emerald-800 bg-emerald-900/50 p-4">
          <h2 className="text-base font-semibold">Codes existants</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-emerald-800 text-left text-emerald-200">
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Nom</th>
                  <th className="px-2 py-2">Nouveau code</th>
                  <th className="px-2 py-2">Expiration</th>
                  <th className="px-2 py-2">Actif</th>
                  <th className="px-2 py-2">Derniere utilisation</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedCodes.map((r) => {
                  const d = drafts[r.id];
                  return (
                    <tr key={r.id} className="border-b border-emerald-900/40">
                      <td className="px-2 py-2">
                        <select
                          className="rounded-md border border-emerald-700 bg-emerald-950 px-2 py-1"
                          value={d?.role ?? r.role}
                          onChange={(e) => setDraft(r.id, { role: e.target.value as Role })}
                        >
                          <option value="client">client</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="rounded-md border border-emerald-700 bg-emerald-950 px-2 py-1"
                          value={d?.name ?? r.name}
                          onChange={(e) => setDraft(r.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="rounded-md border border-emerald-700 bg-emerald-950 px-2 py-1"
                          value={d?.code ?? ""}
                          onChange={(e) => setDraft(r.id, { code: e.target.value })}
                          placeholder="Laisser vide pour ne pas changer"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="datetime-local"
                          className="rounded-md border border-emerald-700 bg-emerald-950 px-2 py-1"
                          value={d?.expiresAt ?? ""}
                          onChange={(e) => setDraft(r.id, { expiresAt: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={d?.isActive ?? r.isActive}
                          onChange={(e) => setDraft(r.id, { isActive: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleString("fr-FR") : "-"}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium hover:bg-emerald-500 disabled:opacity-60"
                          disabled={savingId === r.id}
                          onClick={() => void saveRow(r.id)}
                        >
                          {savingId === r.id ? "Sauvegarde..." : "Sauvegarder"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-emerald-800 bg-emerald-900/50 p-4">
          <h2 className="text-base font-semibold">Statistiques connexions</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md bg-emerald-800/60 p-3">
              <p className="text-xs text-emerald-200">Connexions jour</p>
              <p className="text-lg font-semibold">{stats?.summary.todayTotal ?? 0}</p>
            </div>
            <div className="rounded-md bg-emerald-800/60 p-3">
              <p className="text-xs text-emerald-200">Reussies jour</p>
              <p className="text-lg font-semibold">{stats?.summary.todaySuccess ?? 0}</p>
            </div>
            <div className="rounded-md bg-emerald-800/60 p-3">
              <p className="text-xs text-emerald-200">Echouees jour</p>
              <p className="text-lg font-semibold">{stats?.summary.todayFailed ?? 0}</p>
            </div>
            <div className="rounded-md bg-emerald-800/60 p-3">
              <p className="text-xs text-emerald-200">IP bloquees</p>
              <p className="text-lg font-semibold">{stats?.summary.blockedIpsCount ?? 0}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-md border border-emerald-800">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-emerald-800 text-left text-emerald-200">
                    <th className="px-2 py-1">Jour</th>
                    <th className="px-2 py-1">Total</th>
                    <th className="px-2 py-1">Succes</th>
                    <th className="px-2 py-1">Echecs</th>
                    <th className="px-2 py-1">IP uniques</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.daily ?? []).map((r) => (
                    <tr key={r.day} className="border-b border-emerald-900/40">
                      <td className="px-2 py-1">{r.day}</td>
                      <td className="px-2 py-1">{r.total}</td>
                      <td className="px-2 py-1">{r.success}</td>
                      <td className="px-2 py-1">{r.failed}</td>
                      <td className="px-2 py-1">{r.uniqueIps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-emerald-800">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-emerald-800 text-left text-emerald-200">
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">IP</th>
                    <th className="px-2 py-1">Role</th>
                    <th className="px-2 py-1">Statut</th>
                    <th className="px-2 py-1">Motif</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.recentLogs ?? []).slice(0, 25).map((r, idx) => (
                    <tr key={r.createdAt + "-" + String(idx)} className="border-b border-emerald-900/40">
                      <td className="px-2 py-1">{new Date(r.createdAt).toLocaleString("fr-FR")}</td>
                      <td className="px-2 py-1 font-mono">{r.ip}</td>
                      <td className="px-2 py-1">{r.role}</td>
                      <td className="px-2 py-1">{r.success ? "OK" : "KO"}</td>
                      <td className="px-2 py-1">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
