"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function TrainersChart({
  data,
}: {
  data: { trainer: string; sessions: number; completed: number }[];
}) {
  const top = data.slice(0, 12);
  if (top.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">No trainer data</p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="trainer"
          width={120}
          tick={{ fontSize: 11 }}
        />
        <Tooltip />
        <Bar dataKey="sessions" name="Sessions" fill="#6366f1" radius={[0, 4, 4, 0]} />
        <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
