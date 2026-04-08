import type { App } from "@slack/bolt";
import { getBlockButtonValue } from "@/slack/actionValue";
import { getSupabaseAdmin } from "@/lib/supabase";
import { transitionState } from "@/lib/stateMachine";
import { growthPickupCard } from "@/slack/blockKit";

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

    await client.chat.postMessage({
      channel: userId,
      text: `You accepted the new time for *${row.topic}*. The session is confirmed.`,
    });

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

    // Re-use BP confirm flow: notify growth
    const growthChannel = process.env.GROWTH_CHANNEL_ID;
    if (growthChannel) {
      const { data: r2 } = await supabase
        .from("webinar_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      if (r2) {
        const g = await client.chat.postMessage({
          channel: growthChannel,
          text: `Pick up webinar: ${r2.topic}`,
          blocks: growthPickupCard({
            requestId,
            topic: r2.topic,
            trainerName: r2.trainer_name,
            requestedDate: r2.requested_date,
          }),
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
      }
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

    await client.chat.postMessage({
      channel: userId,
      text: `You declined the alternative for *${row.topic}*. The request is cancelled.`,
    });

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
