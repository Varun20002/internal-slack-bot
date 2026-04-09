"use client";

import { useMemo, useState } from "react";
import type { DashboardPayload } from "@/lib/dashboardData";
import { MetricCard } from "@/components/MetricCard";
import { RequestsTable } from "@/components/RequestsTable";
import { StatePieChart } from "@/components/charts/StatePieChart";
import { VolumeBarChart } from "@/components/charts/VolumeBarChart";
import { SlaLineChart } from "@/components/charts/SlaLineChart";
import { TrainersChart } from "@/components/TrainersChart";
import { StatusBadge } from "@/components/StatusBadge";
import type { WebinarState } from "@/lib/types";
import { WEBINAR_STATES } from "@/lib/types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "requests", label: "All requests" },
  { id: "trainers", label: "Trainers" },
  { id: "sla", label: "SLA & alerts" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DashboardShell({ data }: { data: DashboardPayload }) {
  const [tab, setTab] = useState<TabId>("overview");

  const stateCounts = useMemo(() => {
    const map = Object.fromEntries(
      WEBINAR_STATES.map((s) => [s, 0])
    ) as Record<WebinarState, number>;
    for (const r of data.requests) {
      map[r.state as WebinarState] += 1;
    }
    return WEBINAR_STATES.map((state) => ({ state, count: map[state] }));
  }, [data.requests]);

  const weekMetrics = useMemo(() => {
    const asOfMs = new Date(data.asOf).getTime();
    const weekAgo = new Date(asOfMs - 7 * 24 * 60 * 60 * 1000);
    const inWeek = data.requests.filter(
      (r) => new Date(r.created_at) >= weekAgo
    );
    return {
      total: inWeek.length,
      pending: inWeek.filter((r) => r.state === "PENDING_APPROVAL").length,
      inProgress: inWeek.filter((r) => r.state === "IN_PROGRESS").length,
      completed: inWeek.filter((r) => r.state === "COMPLETED").length,
    };
  }, [data.requests, data.asOf]);

  const volumeData = useMemo(() => {
    const now = new Date(data.asOf).getTime();
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      days[key] = 0;
    }
    for (const r of data.requests) {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      if (days[key] !== undefined) days[key] += 1;
    }
    return Object.entries(days).map(([day, count]) => ({
      day: day.slice(5),
      count,
    }));
  }, [data.requests, data.asOf]);

  const pendingQueue = useMemo(
    () => data.requests.filter((r) => r.state === "PENDING_APPROVAL"),
    [data.requests]
  );

  const trainerStats = useMemo(() => {
    const m = new Map<
      string,
      { sessions: number; completed: number }
    >();
    for (const r of data.requests) {
      const t = r.trainer_name || "Unknown";
      if (!m.has(t)) m.set(t, { sessions: 0, completed: 0 });
      const row = m.get(t)!;
      row.sessions += 1;
      if (r.state === "COMPLETED") row.completed += 1;
    }
    return [...m.entries()]
      .map(([trainer, v]) => ({ trainer, ...v }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [data.requests]);

  const slaSeries = useMemo(() => {
    const byDay: Record<string, { bp: number; content: number }> = {};
    for (const row of data.slaRows) {
      const day = new Date(row.created_at).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { bp: 0, content: 0 };
      if (row.action === "sla_bp_breach") byDay[day].bp += 1;
      if (row.action === "sla_content_breach") byDay[day].content += 1;
    }
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: date.slice(5),
        bp: v.bp,
        content: v.content,
      }));
  }, [data.slaRows]);

  const recentSla = useMemo(
    () => data.slaRows.slice(0, 40),
    [data.slaRows]
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/80 md:block">
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Webinar Ops
          </p>
          <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            BP Dashboard
          </p>
        </div>
        <nav className="flex flex-col gap-1 px-3 pb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 overflow-auto p-6 md:p-10">
        <header className="mb-8 md:hidden">
          <select
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={tab}
            onChange={(e) => setTab(e.target.value as TabId)}
          >
            {TABS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </header>

        {data.error ? (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {data.error}
          </div>
        ) : null}

        {tab === "overview" ? (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                Overview
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Metrics for the last 7 days (rolling)
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Requests (7d)" value={weekMetrics.total} />
              <MetricCard title="Pending BP" value={weekMetrics.pending} />
              <MetricCard title="In progress" value={weekMetrics.inProgress} />
              <MetricCard title="Completed (7d)" value={weekMetrics.completed} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Requests by state
                </h2>
                <StatePieChart counts={stateCounts} />
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Request volume (30d)
                </h2>
                <VolumeBarChart data={volumeData} />
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                BP pending queue
              </h2>
              {pendingQueue.length === 0 ? (
                <p className="text-sm text-zinc-500">No items pending approval</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {pendingQueue.slice(0, 15).map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {r.topic}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {r.trainer_name} ·{" "}
                          {new Date(r.requested_date).toUTCString()}
                        </p>
                      </div>
                      <StatusBadge state={r.state as WebinarState} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === "requests" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                All requests
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Filter by state or trainer name
              </p>
            </div>
            <RequestsTable requests={data.requests} />
          </div>
        ) : null}

        {tab === "trainers" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                Trainers
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Utilization by trainer (all time in dataset)
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <TrainersChart data={trainerStats} />
            </div>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <tr>
                    <th className="px-4 py-3 font-medium">Trainer</th>
                    <th className="px-4 py-3 font-medium">Sessions</th>
                    <th className="px-4 py-3 font-medium">Completed</th>
                    <th className="px-4 py-3 font-medium">Completion rate</th>
                  </tr>
                </thead>
                <tbody>
                  {trainerStats.map((t) => (
                    <tr
                      key={t.trainer}
                      className="border-b border-zinc-100 dark:border-zinc-800/80"
                    >
                      <td className="px-4 py-3 font-medium">{t.trainer}</td>
                      <td className="px-4 py-3">{t.sessions}</td>
                      <td className="px-4 py-3">{t.completed}</td>
                      <td className="px-4 py-3">
                        {t.sessions
                          ? `${Math.round((t.completed / t.sessions) * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "sla" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                SLA &amp; alerts
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Breaches recorded when cron jobs post to ops (deduped per request)
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                SLA breach history
              </h2>
              <SlaLineChart data={slaSeries} />
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Recent alerts
              </h2>
              {recentSla.length === 0 ? (
                <p className="text-sm text-zinc-500">No SLA rows yet</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {recentSla.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-2 dark:border-zinc-800"
                    >
                      <span className="font-mono text-xs text-zinc-500">
                        {r.request_id ?? "—"}
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {r.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-zinc-500">
                        {new Date(r.created_at).toUTCString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
