import type { App } from "@slack/bolt";
import { getBlockButtonValue } from "@/slack/actionValue";
import { getSupabaseAdmin } from "@/lib/supabase";
import { transitionState } from "@/lib/stateMachine";
import { seedChecklistAndPostToGrowthChannel } from "@/slack/growthChecklistFlow";

export function registerEmployeeActions(app: App): void {
  app.action("employee_accept_alt", async ({ ack, body, client, logger }) => {
    await ack();
    const requestId = getBlockButtonValue(body);
    if (!requestId) return;
    const userId = body.user.id;

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("webinar_requests")
      .select("employee_slack_id, alt_date, topic")
      .eq("id", requestId)
      .single();

    if (!row?.alt_date || row.employee_slack_id !== userId) {
      logger.warn("accept_alt: wrong user or missing alt_date");
      return;
    }

    const userInfo = await client.users.info({ user: userId });
    const actorName =
      userInfo.user?.real_name || userInfo.user?.name || userId;

    try {
      await transitionState({
        requestId,
        toState: "CONFIRMED",
        actorId: userId,
        actorName,
        action: "employee_accept_alternative",
        metadata: { new_requested_date: row.alt_date },
        columnUpdates: {
          requested_date: row.alt_date,
        },
      });
    } catch (e) {
      logger.error("employee_accept_alt failed", e);
      return;
    }

    try {
      const dm = await client.conversations.open({ users: userId });
      if (dm.channel?.id) {
        await client.chat.postMessage({
          channel: dm.channel.id,
          text: `You accepted the new time for *${row.topic}*. The session is confirmed.`,
        });
      }
    } catch (e) {
      logger.error("Failed to DM employee after accept alt", e);
    }

    // Notify BP channel card if we still have refs
    const { data: full } = await supabase
      .from("webinar_requests")
      .select("bp_channel_id, bp_message_ts, topic")
      .eq("id", requestId)
      .single();
    if (full?.bp_channel_id && full.bp_message_ts) {
      await client.chat.update({
        channel: full.bp_channel_id,
        ts: full.bp_message_ts,
        text: `Confirmed (alt accepted): ${full.topic}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ *Employee accepted* the alternative.\n*${full.topic}* is now *CONFIRMED*.`,
            },
          },
        ],
      });
    }

    try {
      await seedChecklistAndPostToGrowthChannel(
        client,
        requestId,
        userId,
        actorName,
        logger
      );
    } catch (e) {
      logger.error("Failed to seed checklist / post Growth after alt accept", e);
    }
  });

  app.action("employee_decline_alt", async ({ ack, body, client, logger }) => {
    await ack();
    const requestId = getBlockButtonValue(body);
    if (!requestId) return;
    const userId = body.user.id;

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("webinar_requests")
      .select("employee_slack_id, topic")
      .eq("id", requestId)
      .single();

    if (row?.employee_slack_id !== userId) {
      logger.warn("decline_alt: wrong user");
      return;
    }

    const userInfo = await client.users.info({ user: userId });
    const actorName =
      userInfo.user?.real_name || userInfo.user?.name || userId;

    try {
      await transitionState({
        requestId,
        toState: "CANCELLED",
        actorId: userId,
        actorName,
        action: "employee_decline_alternative",
      });
    } catch (e) {
      logger.error("employee_decline_alt failed", e);
      return;
    }

    try {
      const dm = await client.conversations.open({ users: userId });
      if (dm.channel?.id) {
        await client.chat.postMessage({
          channel: dm.channel.id,
          text: `You declined the alternative for *${row.topic}*. The request is cancelled.`,
        });
      }
    } catch (e) {
      logger.error("Failed to DM employee after decline alt", e);
    }

    const { data: full } = await supabase
      .from("webinar_requests")
      .select("bp_channel_id, bp_message_ts, topic")
      .eq("id", requestId)
      .single();
    if (full?.bp_channel_id && full.bp_message_ts) {
      await client.chat.update({
        channel: full.bp_channel_id,
        ts: full.bp_message_ts,
        text: `Cancelled: ${full.topic}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚫 *Employee declined* the alternative.\n*${full.topic}* → *CANCELLED*.`,
            },
          },
        ],
      });
    }
  });
}
