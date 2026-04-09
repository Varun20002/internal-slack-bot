import type { App } from "@slack/bolt";
import { getSupabaseAdmin } from "@/lib/supabase";
import { transitionState } from "@/lib/stateMachine";
import { combineDateTimeUtc } from "@/lib/datetime";
import { bpRequestCard } from "@/slack/blockKit";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function registerWebinarCommand(app: App): void {
  app.command("/webinar", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          callback_id: "webinar_submit",
          private_metadata: JSON.stringify({ channel_id: body.channel_id }),
          title: { type: "plain_text", text: "Request a webinar" },
          submit: { type: "plain_text", text: "Submit" },
          close: { type: "plain_text", text: "Cancel" },
          blocks: [
            {
              type: "input",
              block_id: "topic",
              label: { type: "plain_text", text: "Topic" },
              element: {
                type: "plain_text_input",
                action_id: "val",
                placeholder: { type: "plain_text", text: "Webinar title" },
              },
            },
            {
              type: "input",
              block_id: "trainer_name",
              label: { type: "plain_text", text: "Trainer" },
              element: {
                type: "plain_text_input",
                action_id: "val",
                placeholder: { type: "plain_text", text: "Trainer name" },
              },
            },
            {
              type: "input",
              block_id: "preferred_date",
              label: { type: "plain_text", text: "Preferred date" },
              element: {
                type: "datepicker",
                action_id: "val",
              },
            },
            {
              type: "input",
              block_id: "preferred_time",
              label: { type: "plain_text", text: "Time (UTC)" },
              element: {
                type: "timepicker",
                action_id: "val",
                placeholder: { type: "plain_text", text: "Select time" },
              },
              hint: {
                type: "plain_text",
                text: "Times are stored in UTC for consistency.",
              },
            },
            {
              type: "input",
              block_id: "attendees_est",
              label: { type: "plain_text", text: "Expected attendees" },
              element: {
                type: "plain_text_input",
                action_id: "val",
                placeholder: { type: "plain_text", text: "e.g. 120" },
              },
            },
          ],
        },
      });
    } catch (err) {
      logger.error("Failed to open webinar modal", err);
    }
  });

  app.view("webinar_submit", async ({ ack, view, client, body, logger }) => {
    const topic =
      view.state.values.topic?.val?.value?.trim() || "";
    const trainerName =
      view.state.values.trainer_name?.val?.value?.trim() || "";
    const date =
      view.state.values.preferred_date?.val?.selected_date || "";
    const time =
      view.state.values.preferred_time?.val?.selected_time || "";
    const attendeesRaw =
      view.state.values.attendees_est?.val?.value?.trim() || "";

    const errors: Record<string, string> = {};
    if (!topic) errors.topic = "Required";
    if (!trainerName) errors.trainer_name = "Required";
    if (!date) errors.preferred_date = "Required";
    if (!time) errors.preferred_time = "Required";
    const attendees = parseInt(attendeesRaw, 10);
    if (!Number.isFinite(attendees) || attendees < 1) {
      errors.attendees_est = "Enter a positive number";
    }

    if (Object.keys(errors).length > 0) {
      await ack({
        response_action: "errors",
        errors,
      });
      return;
    }

    await ack();

    const userId = body.user.id;
    const userInfo = await client.users.info({ user: userId });
    const employeeName =
      userInfo.user?.real_name ||
      userInfo.user?.name ||
      userId;

    const requestedIso = combineDateTimeUtc(date, time);
    const supabase = getSupabaseAdmin();

    const { data: inserted, error: insertErr } = await supabase
      .from("webinar_requests")
      .insert({
        topic,
        trainer_name: trainerName,
        requested_date: requestedIso,
        attendees_est: attendees,
        state: "RAISED",
        employee_slack_id: userId,
        employee_name: employeeName,
      })
      .select("id")
      .single();

    if (insertErr || !inserted?.id) {
      logger.error("Insert webinar failed", insertErr);
      return;
    }

    const requestId = inserted.id as string;

    try {
      await transitionState({
        requestId,
        toState: "PENDING_APPROVAL",
        actorId: userId,
        actorName: employeeName,
        action: "submit_webinar_request",
        metadata: { topic, requested_date: requestedIso },
      });
    } catch (e) {
      logger.error("State transition after insert failed", e);
    }

    try {
      const bpChannel = requireEnv("BP_CHANNEL_ID");
      const posted = await client.chat.postMessage({
        channel: bpChannel,
        text: `Webinar request: ${topic}`,
        blocks: bpRequestCard({
          requestId,
          topic,
          trainerName: trainerName,
          requestedDate: requestedIso,
          attendees,
          employeeName,
        }),
      });

      if (posted.ts && posted.channel) {
        await supabase
          .from("webinar_requests")
          .update({
            bp_channel_id: posted.channel,
            bp_message_ts: posted.ts,
          })
          .eq("id", requestId);
      }
    } catch (e) {
      logger.error("Failed to post to BP channel", e);
    }

    try {
      const dm = await client.conversations.open({ users: userId });
      if (dm.channel?.id) {
        await client.chat.postMessage({
          channel: dm.channel.id,
          text: `Your webinar request for *${topic}* was submitted and is pending BP review.`,
        });
      }
    } catch (e) {
      logger.error("Failed to DM employee confirmation", e);
    }
  });
}
