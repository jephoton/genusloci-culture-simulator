"use client";

import { useState } from "react";
import { CITIES } from "@/geo/cities";
import { buildSubmission } from "./build-console-state";

type BuildStatus = { city: string; stage: string; status: string; calls: number; maxCalls: number; failures: number; updatedAt: string; error?: string };
type Quota = { remaining: number | null; period: string | null; currentPeriod: string; floor: number };

const field = "rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-violet-400/50";
const button = "rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40";

/**
 * Operator controls for on-demand world builds (/api/world-builds). The token is kept in this
 * component's memory only: never in the URL, storage or the bundle.
 */
export function BuildCityConsole() {
  const [token, setToken] = useState("");
  const [city, setCity] = useState<string>(Object.keys(CITIES)[0]);
  const [maxCalls, setMaxCalls] = useState(120);
  const [build, setBuild] = useState<BuildStatus | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [remaining, setRemaining] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (method: "GET" | "POST" | "PATCH", body?: unknown) => {
    setBusy(true);
    setMessage(null);
    try {
      const url = method === "GET" ? `/api/world-builds?city=${encodeURIComponent(city)}` : "/api/world-builds";
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token.trim()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { build?: BuildStatus | null; quota?: Quota | { remaining: number; period: string }; error?: string };
      if (data.build !== undefined) {
        setBuild(data.build);
        if (data.build?.city === city) setMaxCalls(data.build.maxCalls);
      }
      if (data.quota && "currentPeriod" in data.quota) setQuota(data.quota);
      if (method === "PATCH" && res.ok) setMessage(`Quota reconciled: ${(data.quota as { remaining: number }).remaining} calls for ${(data.quota as { period: string }).period}.`);
      else if (data.error) setMessage(`${res.status}: ${data.error}`);
      else if (!res.ok) setMessage(`Request failed (${res.status}).`);
    } catch {
      setMessage("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const hasToken = token.trim().length > 0;
  return (
    <main className="mx-auto max-w-xl space-y-5 p-6 text-sm text-zinc-200">
      <header className="space-y-1">
        <h1 className="text-lg font-medium text-zinc-50">Build a city</h1>
        <p className="text-zinc-400">
          Operator controls for on-demand Qloo world builds. Each request advances one bounded stage; press Continue until the build completes. Builds stop at the
          per-build call budget and always keep {quota?.floor ?? 1000} monthly calls in reserve.
        </p>
      </header>

      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs text-zinc-400">Operator token</span>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className={`${field} w-full`} />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-zinc-400">City</span>
            <select disabled={busy} value={city} onChange={(e) => { setCity(e.target.value); setBuild(null); }} className={field}>
              {Object.values(CITIES).map((c) => (
                <option key={c.slug} value={c.slug} className="bg-zinc-900">{c.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-zinc-400">Call budget (20–180)</span>
            <input type="number" min={20} max={180} disabled={busy || build?.city === city} value={maxCalls} onChange={(e) => setMaxCalls(Number(e.target.value))} className={`${field} w-28`} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!hasToken || busy} onClick={() => void call("GET")} className={button}>Refresh status</button>
          <button type="button" disabled={!hasToken || busy} onClick={() => void call("POST", buildSubmission(city, maxCalls, build))} className={button}>{build ? "Continue" : "Start"}</button>
          <button type="button" disabled={!hasToken || busy || !build || (build.status !== "failed" && build.status !== "blocked")} onClick={() => void call("POST", buildSubmission(city, maxCalls, build, true))} className={button}>Retry</button>
        </div>
      </section>

      {build && (
        <section className="space-y-1 rounded-lg border border-white/10 p-3">
          <h2 className="font-medium text-zinc-50">{CITIES[build.city as keyof typeof CITIES]?.name ?? build.city}</h2>
          <p>Stage: {build.stage} · Status: <span className={build.status === "failed" || build.status === "blocked" ? "text-rose-300" : build.status === "completed" ? "text-emerald-300" : ""}>{build.status}</span></p>
          <p>Calls: {build.calls} of {build.maxCalls} · Failures: {build.failures}</p>
          {build.error && <p className="text-rose-300">{build.error}</p>}
          <p className="text-xs text-zinc-500">Updated {build.updatedAt}</p>
        </section>
      )}
      {build === null && quota && <p className="text-zinc-400">No build for this city yet.</p>}

      <section className="space-y-2 rounded-lg border border-white/10 p-3">
        <h2 className="font-medium text-zinc-50">Monthly quota</h2>
        {quota ? (
          <p>
            Estimate: {quota.remaining ?? "not set"} calls for {quota.period ?? "no period"} (current month {quota.currentPeriod})
            {quota.period && quota.period !== quota.currentPeriod && <span className="text-amber-200"> · a new month began: reconcile before building</span>}
          </p>
        ) : (
          <p className="text-zinc-400">Refresh status to see the estimate.</p>
        )}
        <p className="text-xs text-zinc-400">Enter the remaining calls you have verified (Qloo dashboard or the X-Month-RateLimit-Remaining header). This replaces the estimate.</p>
        <div className="flex gap-2">
          <input type="number" min={0} max={10000} value={remaining} onChange={(e) => setRemaining(e.target.value)} placeholder="e.g. 9600" className={`${field} w-32`} />
          <button
            type="button"
            disabled={!hasToken || busy || remaining === "" || !quota}
            onClick={() => void call("PATCH", { remaining: Number(remaining), period: quota!.currentPeriod })}
            className={button}
          >
            Reconcile for {quota?.currentPeriod ?? "this month"}
          </button>
        </div>
      </section>

      {message && <p role="status" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">{message}</p>}
    </main>
  );
}
