import { getSupabaseAdmin } from "@/lib/supabase";
import type { WebinarState } from "@/lib/types";

export type ColumnPatch = Partial<{
  bp_slack_id: string | null;
  growth_slack_id: string | null;
  rejection_reason: string | null;
  alt_date: string | null;
  requested_date: string | null;
  bp_channel_id: string | null;
  bp_message_ts: string | null;
  growth_channel_id: string | null;
  growth_message_ts: string | null;
}>;

export type TransitionStateParams = {
  requestId: string;
  toState: WebinarState;
  actorId: string;
  actorName: string;
  action: string;
  metadata?: Record<string, unknown>;
  columnUpdates?: ColumnPatch;
};

export class InvalidTransitionError extends Error {
  constructor(
    public from: string,
    public to: string
  ) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * Calls the `transition_state` PostgreSQL function via Supabase RPC.
 * The function runs atomically inside a transaction with FOR UPDATE locking.
 * This avoids needing a direct Postgres connection (DATABASE_URL).
 */
export async function transitionState(
  params: TransitionStateParams
): Promise<{ previousState: WebinarState; newState: WebinarState }> {
  const {
    requestId,
    toState,
    actorId,
    actorName,
    action,
    metadata = {},
    columnUpdates = {},
  } = params;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("transition_state", {
    p_request_id: requestId,
    p_to_state: toState,
    p_actor_id: actorId,
    p_actor_name: actorName,
    p_action: action,
    p_metadata: metadata,
    p_column_updates: columnUpdates,
  });

  if (error) {
    if (error.message.includes("Invalid transition")) {
      const match = error.message.match(/Invalid transition: (\S+) → (\S+)/);
      throw new InvalidTransitionError(
        match?.[1] ?? "UNKNOWN",
        match?.[2] ?? toState
      );
    }
    throw new Error(error.message);
  }

  return {
    previousState: (data as { previousState: string }).previousState as WebinarState,
    newState: (data as { newState: string }).newState as WebinarState,
  };
}
