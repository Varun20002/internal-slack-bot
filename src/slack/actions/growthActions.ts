import type { App } from "@slack/bolt";
import { getBlockButtonValue } from "@/slack/actionValue";
import { getSupabaseAdmin } from "@/lib/supabase";
import { transitionState } from "@/lib/stateMachine";
import { growthChecklistCompletedBlocks } from "@/slack/blockKit";
import { buildChecklistMessage } from "@/slack/growthChecklistMessage";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function registerGrowthActions(app: App): void {
  app.action(/^growth_toggle_checklist_/, async ({ ack, body, client, logger }) => {
    await ack();
    const raw = getBlockButtonValue(body);
    if (!raw) return;
    const [requestId, item] = raw.split("|");
    if (!requestId || !item) return;
    const userId = body.user.id;

    const supabase = getSupabaseAdmin();
    const { data: req } = await supabase
      .from("webinar_requests")
      .select(
        "state, growth_channel_id, growth_message_ts"
      )
      .eq("id", requestId)
      .single();

    if (req?.state !== "IN_PROGRESS") return;
    if (!req.growth_channel_id || !req.growth_message_ts) return;

    const { data: row } = await supabase
      .from("content_checklist")
      .select("id, completed")
      .eq("request_id", requestId)
      .eq("item", item)
      .maybeSingle();

    if (!row?.id) return;

    await supabase
      .from("content_checklist")
      .update({
        completed: !row.completed,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    await supabase
      .from("webinar_requests")
      .update({ growth_slack_id: userId })
      .eq("id", requestId);

    const payload = await buildChecklistMessage(requestId);
    if (!payload) return;

    try {
      await client.chat.update({
        channel: req.growth_channel_id,
        ts: req.growth_message_ts,
        text: payload.text,
        blocks: payload.blocks,
      });
    } catch (e) {
      logger.error("Failed to update Growth checklist message", e);
    }
  });

  app.action("growth_mark_complete", async ({ ack, body, client, logger }) => {
    await ack();
    const requestId = getBlockButtonValue(body);
    if (!requestId) return;
    const userId = body.user.id;

    const supabase = getSupabaseAdmin();
    const { data: req } = await supabase
      .from("webinar_requests")
      .select(
        "state, topic, growth_channel_id, growth_message_ts"
      )
      .eq("id", requestId)
      .single();

    if (req?.state !== "IN_PROGRESS") return;

    const channelId =
      req.growth_channel_id ||
      (body as { channel?: { id?: string } }).channel?.id;
    if (!channelId) return;

    const { data: items } = await supabase
      .from("content_checklist")
      .select("item, completed")
      .eq("request_id", requestId);

    const incomplete = (items || []).filter((i) => !i.completed);
    if (incomplete.length > 0) {
      try {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `Complete all checklist items first (${incomplete.map((i) => i.item).join(", ")} remaining).`,
        });
      } catch (e) {
        logger.error("Failed to send ephemeral for incomplete checklist", e);
      }
      return;
    }

    const userInfo = await client.users.info({ user: userId });
    const actorName =
      userInfo.user?.real_name || userInfo.user?.name || userId;

    try {
      await transitionState({
        requestId,
        toState: "COMPLETED",
        actorId: userId,
        actorName,
        action: "growth_mark_complete",
        columnUpdates: { growth_slack_id: userId },
      });
    } catch (e) {
      logger.error("growth_mark_complete transition failed", e);
      return;
    }

    const ops = requireEnv("OPS_CHANNEL_ID");
    try {
      await client.chat.postMessage({
        channel: ops,
        text: `Webinar session completed: ${req.topic}`,
      });
    } catch (e) {
      logger.error("Failed to post OPS completion notice", e);
    }

    if (req.growth_channel_id && req.growth_message_ts) {
      try {
        await client.chat.update({
          channel: req.growth_channel_id,
          ts: req.growth_message_ts,
          text: `Completed: ${req.topic}`,
          blocks: growthChecklistCompletedBlocks({
            topic: req.topic || "",
            completedBySlackId: userId,
          }),
        });
      } catch (e) {
        logger.error("Failed to replace Growth message after complete", e);
      }
    }
  });
}
