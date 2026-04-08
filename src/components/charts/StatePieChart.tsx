"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { WebinarState } from "@/lib/types";

const COLORS = [
  "#71717a",
  "#f59e0b",
  "#0ea5e9",
  "#f43f5e",
  "#8b5cf6",
  "#2563eb",
  "#10b981",
  "#525252",
];

export function StatePieChart({
  counts,
}: {
  counts: { state: WebinarState; count: number }[];
}) {
  const data = counts.filter((c) => c.count > 0);
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">No data yet</p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="state"
          cx="50%"
          cy="50%"
          outerRadius={90}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
