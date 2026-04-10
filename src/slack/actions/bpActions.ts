import type { App } from "@slack/bolt";
import { getBlockButtonValue } from "@/slack/actionValue";
import { combineDateTimeUtc } from "@/lib/datetime";
import { getSupabaseAdmin } from "@/lib/supabase";
import { transitionState } from "@/lib/stateMachine";
import {
  altSuggestedNotice,
  confirmedNotice,
  employeeAltDecisionBlocks,
  rejectedNotice,
} from "@/slack/blockKit";
import { seedChecklistAndPostToGrowthChannel } from "@/slack/growthChecklistFlow";

export function registerBpActions(app: App): void {
  app.action("bp_confirm", async ({ ack, body, client, logger }) => {
    await ack();
    const requestId = getBlockButtonValue(body);
    if (!requestId) return;
    const userId = body.user.id;
    const userInfo = await client.users.info({ user: userId });
    const actorName =
      userInfo.user?.real_name || userInfo.user?.name || userId;

    try {
      await transitionState({
        requestId,
        toState: "CONFIRMED",
        actorId: userId,
        actorName,
        action: "bp_confirm",
        columnUpdates: { bp_slack_id: userId },
      });
    } catch (e) {
      logger.error("bp_confirm failed", e);
      try {
        await client.chat.postEphemeral({
          channel: (body as { channel?: { id: string } }).channel?.id || userId,
          user: userId,
          text: `Could not confirm this request. It may already be processed or in an unexpected state. Error: ${e instanceof Error ? e.message : String(e)}`,
        });
      } catch { /* best effort */ }
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("webinar_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    await Promise.all([
      (async () => {
        try {
          if (row?.bp_channel_id && row.bp_message_ts) {
            await client.chat.update({
              channel: row.bp_channel_id,
              ts: row.bp_message_ts,
              text: `Confirmed: ${row.topic}`,
              blocks: confirmedNotice(actorName),
            });
          }
        } catch (e) {
          logger.error("Failed to update BP message after confirm", e);
        }
      })(),
      (async () => {
        try {
          if (row?.employee_slack_id) {
            const dm = await client.conversations.open({ users: row.employee_slack_id });
            if (dm.channel?.id) {
              await client.chat.postMessage({
                channel: dm.channel.id,
                text: `Your webinar request *${row.topic}* was *confirmed*. The Growth team will coordinate content in the Growth channel.`,
              });
            }
          }
        } catch (e) {
          logger.error("Failed to DM employee after confirm", e);
        }
      })(),
      seedChecklistAndPostToGrowthChannel(
        client,
        requestId,
        userId,
        actorName,
        logger
      ).catch((e) => {
        logger.error("Failed to seed checklist / post Growth channel after confirm", e);
      }),
    ]);
  });

  app.action("bp_reject", async ({ ack, body, client, logger }) => {
    await ack();
    const requestId = getBlockButtonValue(body);
    if (!requestId) return;
    const triggerId = (body as { trigger_id: string }).trigger_id;

    try {
      await client.views.open({
        trigger_id: triggerId,
        view: {
          type: "modal",
          callback_id: "bp_reject_modal",
          private_metadata: requestId,
          title: { type: "plain_text", text: "Reject request" },
          submit: { type: "plain_text", text: "Reject" },
          close: { type: "plain_text", text: "Cancel" },
          blocks: [
            {
              type: "input",
              block_id: "reason",
              label: { type: "plain_text", text: "Reason" },
              element: {
                type: "plain_text_input",
                action_id: "val",
                multiline: true,
              },
            },
          ],
        },
      });
    } catch (e) {
      logger.error("bp_reject modal open failed", e);
    }
  });

  app.view("bp_reject_modal", async ({ ack, view, client, body, logger }) => {
    const requestId = view.private_metadata;
    const reason =
      view.state.values.reason?.val?.value?.trim() || "";
    if (!reason) {
      await ack({
        response_action: "errors",
        errors: { reason: "Please provide a reason" },
      });
      return;
    }
    await ack();

    const userId = body.user.id;
    const userInfo = await client.users.info({ user: userId });
    const actorName =
      userInfo.user?.real_name || userInfo.user?.name || userId;

    try {
      await transitionState({
        requestId,
        toState: "REJECTED",
        actorId: userId,
        actorName,
        action: "bp_reject",
        metadata: { reason },
        columnUpdates: {
          bp_slack_id: userId,
          rejection_reason: reason,
        },
      });
    } catch (e) {
      logger.error("bp_reject transition failed", e);
      try {
        await client.chat.postMessage({
          channel: userId,
          text: `Could not reject this request. Error: ${e instanceof Error ? e.message : String(e)}`,
        });
      } catch { /* best effort */ }
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("webinar_requests")
      .select("topic, employee_slack_id, bp_channel_id, bp_message_ts")
      .eq("id", requestId)
      .single();

    try {
      if (row?.bp_channel_id && row.bp_message_ts) {
        await client.chat.update({
          channel: row.bp_channel_id,
          ts: row.bp_message_ts,
          text: `Rejected: ${row.topic}`,
          blocks: rejectedNotice(reason, actorName),
        });
      }
    } catch (e) {
      logger.error("Failed to update BP message after reject", e);
    }

    try {
      if (row?.employee_slack_id) {
        const dm = await client.conversations.open({ users: row.employee_slack_id });
        if (dm.channel?.id) {
          await client.chat.postMessage({
            channel: dm.channel.id,
            text: `Your webinar request *${row.topic}* was rejected.\n*Reason:* ${reason}`,
          });
        }
      }
    } catch (e) {
      logger.error("Failed to DM employee after reject", e);
    }
  });

  app.action("bp_suggest_alt", async ({ ack, body, client, logger }) => {
    await ack();
    const requestId = getBlockButtonValue(body);
    if (!requestId) return;
    try {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: {
          type: "modal",
          callback_id: "bp_alt_modal",
          private_metadata: requestId,
          title: { type: "plain_text", text: "Suggest alternative time" },
          submit: { type: "plain_text", text: "Submit" },
          close: { type: "plain_text", text: "Cancel" },
          blocks: [
            {
              type: "input",
              block_id: "alt_date",
              label: { type: "plain_text", text: "New date" },
              element: { type: "datepicker", action_id: "val" },
            },
            {
              type: "input",
              block_id: "alt_time",
              label: { type: "plain_text", text: "New time (UTC)" },
              element: {
                type: "timepicker",
                action_id: "val",
              },
            },
          ],
        },
      });
    } catch (e) {
      logger.error("bp_suggest_alt modal failed", e);
    }
  });

  app.view("bp_alt_modal", async ({ ack, view, client, body, logger }) => {
    const requestId = view.private_metadata;
    const altDate =
      view.state.values.alt_date?.val?.selected_date || "";
    const altTime =
      view.state.values.alt_time?.val?.selected_time || "";
    if (!altDate || !altTime) {
      await ack({
        response_action: "errors",
        errors: {
          ...(altDate ? {} : { alt_date: "Required" }),
          ...(altTime ? {} : { alt_time: "Required" }),
        },
      });
      return;
    }
    await ack();

    const altIso = combineDateTimeUtc(altDate, altTime);
    const userId = body.user.id;
    const userInfo = await client.users.info({ user: userId });
    const actorName =
      userInfo.user?.real_name || userInfo.user?.name || userId;

    try {
      await transitionState({
        requestId,
        toState: "ALT_SUGGESTED",
        actorId: userId,
        actorName,
        action: "bp_suggest_alternative",
        metadata: { alt_date: altIso },
        columnUpdates: { alt_date: altIso, bp_slack_id: userId },
      });
    } catch (e) {
      logger.error("ALT_SUGGESTED transition failed", e);
      try {
        await client.chat.postMessage({
          channel: userId,
          text: `Could not suggest alternative. Error: ${e instanceof Error ? e.message : String(e)}`,
        });
      } catch { /* best effort */ }
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("webinar_requests")
      .select(
        "employee_slack_id, topic, bp_channel_id, bp_message_ts"
      )
      .eq("id", requestId)
      .single();

    try {
      if (row?.bp_channel_id && row.bp_message_ts) {
        await client.chat.update({
          channel: row.bp_channel_id,
          ts: row.bp_message_ts,
          text: `Alternative suggested for: ${row.topic}`,
          blocks: [...altSuggestedNotice(altIso, actorName)],
        });
      }
    } catch (e) {
      logger.error("Failed to update BP message after alt suggest", e);
    }

    try {
      if (row?.employee_slack_id) {
        const dm = await client.conversations.open({ users: row.employee_slack_id });
        if (dm.channel?.id) {
          await client.chat.postMessage({
            channel: dm.channel.id,
            text: `BP suggested a new time for your webinar request *${row.topic}*.`,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*${row.topic}*\nProposed time (UTC): \`${altIso}\``,
                },
              },
              ...employeeAltDecisionBlocks(requestId),
            ],
          });
        }
      }
    } catch (e) {
      logger.error("Failed to DM employee after alt suggest", e);
    }
  });
}
