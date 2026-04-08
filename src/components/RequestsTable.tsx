"use client";

import { useMemo, useState } from "react";
import type { DashboardRequest } from "@/lib/dashboardData";
import type { WebinarState } from "@/lib/types";
import { WEBINAR_STATES } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export function RequestsTable({ requests }: { requests: DashboardRequest[] }) {
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [trainerQ, setTrainerQ] = useState("");

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (stateFilter !== "all" && r.state !== stateFilter) return false;
      if (
        trainerQ &&
        !r.trainer_name.toLowerCase().includes(trainerQ.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [requests, stateFilter, trainerQ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
        >
          <option value="all">All states</option>
          {WEBINAR_STATES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Filter trainer…"
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={trainerQ}
          onChange={(e) => setTrainerQ(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <tr>
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium">Trainer</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Requested by</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="border-b border-zinc-100 dark:border-zinc-800/80"
              >
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {r.topic}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {r.trainer_name}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {new Date(r.requested_date).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge state={r.state as WebinarState} />
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {r.employee_name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">No rows match</p>
        ) : null}
      </div>
    </div>
  );
}
