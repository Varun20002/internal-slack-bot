import type { WebClient } from "@slack/web-api";
import { getSupabaseAdmin } from "@/lib/supabase";
import { transitionState } from "@/lib/stateMachine";
import { GROWTH_CHECKLIST_ITEM_KEYS } from "@/slack/blockKit";
import { buildChecklistMessage } from "@/slack/growthChecklistMessage";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

type BoltLogger = { error: (msg: string, err?: unknown) => void };

/**
 * After BP (or employee alt-accept) reaches CONFIRMED: seed checklist rows,
 * move to IN_PROGRESS, and post the interactive checklist in Growth channel.
 */
export async function seedChecklistAndPostToGrowthChannel(
  client: WebClient,
  requestId: string,
  actorId: string,
  actorName: string,
  logger: BoltLogger
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { count: existing } = await supabase
    .from("content_checklist")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId);

  if (!existing) {
    const rows = GROWTH_CHECKLIST_ITEM_KEYS.map((item) => ({
      request_id: requestId,
      item,
      completed: false,
    }));
    const { error: seedErr } = await supabase
      .from("content_checklist")
      .insert(rows);
    if (seedErr) {
      logger.error("seed_checklist insert failed", seedErr);
      return;
    }
  }

  try {
    await transitionState({
      requestId,
      toState: "IN_PROGRESS",
      actorId,
      actorName,
      action: "growth_checklist_channel_start",
    });
  } catch (e) {
    logger.error("CONFIRMED → IN_PROGRESS transition failed", e);
    return;
  }

  const payload = await buildChecklistMessage(requestId);
  if (!payload) {
    logger.error("buildChecklistMessage returned null", new Error(requestId));
    return;
  }

  try {
    const growthChannel = requireEnv("GROWTH_CHANNEL_ID");
    const g = await client.chat.postMessage({
      channel: growthChannel,
      text: payload.text,
      blocks: payload.blocks,
    });
    if (g.ts && g.channel) {
      await supabase
        .from("webinar_requests")
        .update({
          growth_channel_id: g.channel,
          growth_message_ts: g.ts,
        })
        .eq("id", requestId);
    }
  } catch (e) {
    logger.error("Failed to post Growth channel checklist", e);
  }
}
