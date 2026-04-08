"use client";

import type { WebinarState } from "@/lib/types";

const STYLES: Record<WebinarState, string> = {
  RAISED: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
  PENDING_APPROVAL: "bg-amber-200 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100",
  CONFIRMED: "bg-sky-200 text-sky-950 dark:bg-sky-900/50 dark:text-sky-100",
  REJECTED: "bg-rose-200 text-rose-950 dark:bg-rose-900/50 dark:text-rose-100",
  ALT_SUGGESTED: "bg-violet-200 text-violet-950 dark:bg-violet-900/50 dark:text-violet-100",
  IN_PROGRESS: "bg-blue-200 text-blue-950 dark:bg-blue-900/50 dark:text-blue-100",
  COMPLETED: "bg-emerald-200 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100",
  CANCELLED: "bg-neutral-300 text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100",
};

export function StatusBadge({ state }: { state: WebinarState }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[state]}`}
    >
      {state.replace(/_/g, " ")}
    </span>
  );
}
