import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import { VALID_TRANSITIONS, type WebinarState } from "@/lib/types";

const ALLOWED_COLUMN_PATCHES = new Set<string>([
  "bp_slack_id",
  "growth_slack_id",
  "rejection_reason",
  "alt_date",
  "requested_date",
  "bp_channel_id",
  "bp_message_ts",
  "growth_channel_id",
  "growth_message_ts",
]);

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
  /** Runs in the same transaction after state update + audit insert */
  sideEffects?: (client: PoolClient) => Promise<void>;
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
    sideEffects,
  } = params;

  return withTransaction(async (client) => {
    const lock = await client.query<{ state: string }>(
      `SELECT state FROM webinar_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    if (lock.rowCount === 0) {
      throw new Error(`webinar_requests not found: ${requestId}`);
    }
    const fromState = lock.rows[0].state as WebinarState;

    const allowed = VALID_TRANSITIONS[fromState];
    if (!allowed.includes(toState)) {
      throw new InvalidTransitionError(fromState, toState);
    }

    const patchEntries = Object.entries(columnUpdates).filter(
      ([k, v]) => ALLOWED_COLUMN_PATCHES.has(k) && v !== undefined
    );

    const setFragments: string[] = ["state = $2", "updated_at = now()"];
    const values: unknown[] = [requestId, toState];
    let i = 3;
    for (const [col, val] of patchEntries) {
      setFragments.push(`${col} = $${i}`);
      values.push(val);
      i += 1;
    }

    await client.query(
      `UPDATE webinar_requests SET ${setFragments.join(", ")} WHERE id = $1`,
      values
    );

    await client.query(
      `INSERT INTO audit_log (request_id, actor_id, actor_name, from_state, to_state, action, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        requestId,
        actorId,
        actorName,
        fromState,
        toState,
        action,
        JSON.stringify(metadata),
      ]
    );

    if (sideEffects) {
      await sideEffects(client);
    }

    return { previousState: fromState, newState: toState };
  });
}
