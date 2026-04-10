import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getSlackWeb } from "@/lib/slackWeb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single daily cron that handles:
 *  1. 24-hour webinar reminders (widened to 0–26h window since we only run once/day)
 *  2. BP SLA breaches (PENDING_APPROVAL > 6h)
 *  3. Content SLA breaches (IN_PROGRESS, webinar < 48h, checklist incomplete)
 *
 * Each alert is deduped via audit_log so it fires at most once per request.
 */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const opsChannel = process.env.OPS_CHANNEL_ID;
  if (!opsChannel) {
    return new Response("OPS_CHANNEL_ID missing", { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const slack = getSlackWeb();

  // ── 1. Webinar reminders (confirmed, happening in the next 26 hours) ──
  const { data: reminders } = await supabase.rpc("get_pending_reminders");

  for (const row of reminders ?? []) {
    try {
      const dm = await slack.conversations.open({ users: row.employee_slack_id });
      if (dm.channel?.id) {
        await slack.chat.postMessage({
          channel: dm.channel.id,
          text: `Reminder: your confirmed webinar *${row.topic}* is coming up in the next 24 hours.`,
        });
      }
      await supabase.from("audit_log").insert({
        request_id: row.id,
        actor_id: "cron",
        actor_name: "Vercel Cron",
        from_state: "CONFIRMED",
        to_state: "CONFIRMED",
        action: "cron_reminder_24h",
        metadata: {},
      });
    } catch (e) {
      console.error("reminder failed", row.id, e);
    }
  }

  // ── 2. BP SLA breaches (pending > 6 hours) ──
  const { data: bpBreaches } = await supabase.rpc("get_bp_sla_breaches");

  for (const row of bpBreaches ?? []) {
    await slack.chat.postMessage({
      channel: opsChannel,
      text: `SLA: BP review pending >6h for *${row.topic}* (\`${row.id}\`).`,
    });
    await supabase.from("audit_log").insert({
      request_id: row.id,
      actor_id: "cron",
      actor_name: "Vercel Cron",
      from_state: "PENDING_APPROVAL",
      to_state: "PENDING_APPROVAL",
      action: "sla_bp_breach",
      metadata: {},
    });
  }

  // ── 3. Content SLA breaches (in-progress, < 48h away, checklist incomplete) ──
  const { data: contentBreaches } = await supabase.rpc("get_content_sla_breaches");

  for (const row of contentBreaches ?? []) {
    await slack.chat.postMessage({
      channel: opsChannel,
      text: `SLA: Content incomplete for *${row.topic}* (\`${row.id}\`) — webinar in <48h.`,
    });
    if (row.growth_slack_id) {
      try {
        const dm = await slack.conversations.open({ users: row.growth_slack_id });
        if (dm.channel?.id) {
          await slack.chat.postMessage({
            channel: dm.channel.id,
            text: `Heads up: *${row.topic}* is less than 48 hours away and the content checklist is incomplete.`,
          });
        }
      } catch (e) {
        console.error("content SLA DM failed", row.id, e);
      }
    }
    await supabase.from("audit_log").insert({
      request_id: row.id,
      actor_id: "cron",
      actor_name: "Vercel Cron",
      from_state: "IN_PROGRESS",
      to_state: "IN_PROGRESS",
      action: "sla_content_breach",
      metadata: {},
    });
  }

  return Response.json({
    ok: true,
    reminders: (reminders ?? []).length,
    bpBreaches: (bpBreaches ?? []).length,
    contentBreaches: (contentBreaches ?? []).length,
  });
}
